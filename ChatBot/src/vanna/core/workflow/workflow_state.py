"""
Workflow State Machine and Context Manager for Vanna Agent.

Provides deterministic state management, entity tracking, tool result parsing,
and workflow status transitions (NEW -> UNDERSTANDING -> COLLECTING_DATA -> PROCESSING -> COMPLETED/WAITING_FOR_USER).
"""

from __future__ import annotations

import re
import json
import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timezone
from pydantic import BaseModel, Field

logger = logging.getLogger("vanna.workflow_state")


class WorkflowStatus(str, Enum):
    """Deterministic states of a business workflow."""
    NEW = "NEW"
    UNDERSTANDING = "UNDERSTANDING"
    COLLECTING_DATA = "COLLECTING_DATA"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    WAITING_FOR_USER = "WAITING_FOR_USER"


class CustomerInfo(BaseModel):
    """Customer information identified in workflow."""
    id: Optional[Union[str, int]] = None
    odoo_partner_id: Optional[Union[str, int]] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    source: Optional[str] = "text"  # 'text', 'database', 'context'


class OrderItem(BaseModel):
    """Product item in an order workflow."""
    product_id: Optional[Union[str, int]] = None
    odoo_id: Optional[Union[str, int]] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    qty: int = 1
    price: float = 0.0
    uom: Optional[str] = "Gói"


class ConversationWorkflowState(BaseModel):
    """Structured conversation state tracked across iterations and turns."""
    intent: Optional[str] = None  # CREATE_ORDER, QUERY_DATA, CUSTOMER_INFO, GENERAL_CHAT
    workflow_status: WorkflowStatus = WorkflowStatus.NEW
    current_step: Optional[str] = None
    customer: Optional[CustomerInfo] = None
    items: List[OrderItem] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    tool_results: Dict[str, Any] = Field(default_factory=dict)
    order_draft: Optional[Dict[str, Any]] = None
    last_question_asked: Optional[str] = None
    iteration_count: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return json.loads(self.model_dump_json())

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ConversationWorkflowState:
        if not data:
            return cls()
        try:
            return cls(**data)
        except Exception as e:
            logger.warning(f"Failed to deserialize ConversationWorkflowState: {e}")
            return cls()


def extract_actual_user_prompt(message: str) -> tuple[str, str]:
    """
    Split an enriched message into (context_part, user_part).
    If no enrichment prefix is found, returns ("", message).
    """
    if not message:
        return "", ""

    delimiters = [
        "[CÂU HỎI / YÊU CẦU CỦA NHÂN VIÊN]:",
        "[CÂU HỎI / YÊU CẦU]:",
        "Câu hỏi của nhân viên:",
        "[YÊU CẦU TẠO ĐƠN HÀNG / LÊN ĐƠN]:",
        "[YÊU CẦU]:",
    ]

    for delim in delimiters:
        if delim in message:
            parts = message.split(delim, 1)
            return parts[0].strip(), parts[1].strip()

    return "", message.strip()


def detect_intent(message: str, current_intent: Optional[str] = None) -> str:
    """Detect the user intent from text."""
    if not message:
        return current_intent or "GENERAL_CHAT"

    _, user_part = extract_actual_user_prompt(message)
    msg_lower = user_part.lower().strip() if user_part else message.lower().strip()

    # 1. Customer profile / Lookup keywords (checked first to prevent false order intent)
    customer_keywords = [
        "thông tin khách", "thông tin về khách", "tìm khách", "tra cứu khách", "khách hàng này",
        "hồ sơ khách", "doanh thu của khách", "lịch sử mua hàng", "lịch sử đơn hàng",
        "đơn hàng của khách", "khách này", "khách này mua gì", "khách này đã mua",
        "thông tin người này", "thông tin của khách", "thông tin chi tiết khách",
        "khách hàng mua gì", "khách hàng đã mua"
    ]
    if any(kw in msg_lower for kw in customer_keywords):
        return "CUSTOMER_INFO"

    # 2. General Data query keywords
    query_keywords = [
        "select", "doanh thu", "tổng tiền", "thống kê", "báo cáo",
        "sản phẩm nào", "bán chạy", "tồn kho", "danh sách đơn", "danh sách khách",
        "top sản phẩm", "doanh số", "biểu đồ", "bảng dữ liệu"
    ]
    if any(kw in msg_lower for kw in query_keywords):
        return "QUERY_DATA"

    # 3. Explicit Order creation keywords (ONLY if user explicitly asks to create/make/extract an order)
    order_keywords = [
        "lên đơn", "len don", "tạo đơn", "tao don", "lập đơn", "lap don",
        "đặt đơn", "dat don", "đặt hàng", "dat hang", "bóc tách đơn", "boc tach don",
        "tạo order", "lên order", "order nháp", "lên đơn hàng", "tạo đơn hàng"
    ]
    if any(kw in msg_lower for kw in order_keywords) or "[yêu cầu tạo đơn hàng" in msg_lower:
        return "CREATE_ORDER"

    # 4. Greetings / Chit-chat
    greetings = ["chào", "hello", "hi", "hey", "cảm ơn", "cam on", "thanks", "tks", "ok", "oke", "được rồi"]
    if any(msg_lower.startswith(g) or msg_lower == g for g in greetings):
        return "GENERAL_CHAT"

    # If current_intent was CREATE_ORDER, only maintain it if user prompt has items or confirmation
    if current_intent == "CREATE_ORDER":
        if re.search(r"\b\d+\s*(?:bao|gói|túi|hộp|thùng|phần|cái|lon|kg|[A-Za-z0-9_-]+)\b", msg_lower):
            return "CREATE_ORDER"
        if any(w in msg_lower for w in ["xác nhận", "đồng ý", "sửa", "thêm", "bớt", "xóa"]):
            return "CREATE_ORDER"

    return "GENERAL_CHAT"


def extract_raw_entities_from_text(text: str) -> Dict[str, Any]:
    """
    Extract customer name, SKUs, quantities, and phone numbers.
    Customer info can be extracted from context or user message.
    Order items MUST ONLY be extracted from the user prompt when creating an order.
    """
    if not text:
        return {}

    context_part, user_part = extract_actual_user_prompt(text)
    user_text = user_part if user_part else text

    entities: Dict[str, Any] = {
        "customer_name": None,
        "phone": None,
        "odoo_partner_id": None,
        "address": None,
        "items": []
    }

    # 1. Extract customer details from context if present
    if context_part:
        name_match = re.search(r"-\s*Khách hàng:\s*([^\n(]+)", context_part, re.IGNORECASE)
        if name_match:
            entities["customer_name"] = name_match.group(1).strip()

        phone_ctx_match = re.search(r"-\s*Số điện thoại:\s*([0-9+]+)", context_part, re.IGNORECASE)
        if phone_ctx_match:
            entities["phone"] = phone_ctx_match.group(1).strip()

        odoo_ctx_match = re.search(r"-\s*Mã khách hàng Odoo[^:]*:\s*(\d+)", context_part, re.IGNORECASE)
        if odoo_ctx_match:
            entities["odoo_partner_id"] = odoo_ctx_match.group(1).strip()

        addr_ctx_match = re.search(r"-\s*Địa chỉ:\s*([^\n]+)", context_part, re.IGNORECASE)
        if addr_ctx_match:
            entities["address"] = addr_ctx_match.group(1).strip()

    # 2. Extract customer details from user text if not already found or explicitly specified
    phone_match = re.search(r"\b(0[3|5|7|8|9][0-9]{8})\b", user_text)
    if phone_match:
        entities["phone"] = phone_match.group(1)

    customer_patterns = [
        r"(?:cho khách hàng|cho khách|cho KH|cho anh|cho chị|cho bác|cho cô|cho chú)\s+([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:\s+(?:sđt|đt|sdt|ở|tại|với|gồm|nhé|nha|ạ|\.|\,|$))",
        r"(?:khách hàng|khách|KH):\s*([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:\s+(?:sđt|đt|sdt|ở|tại|với|gồm|nhé|nha|ạ|\.|\,|$))",
        r"\bcho\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)+)",  # Capitalized Vietnamese Name
    ]
    for pattern in customer_patterns:
        match = re.search(pattern, user_text, re.IGNORECASE)
        if match:
            extracted_name = match.group(1).strip()
            if len(extracted_name.split()) <= 5 and not any(w in extracted_name.lower() for w in ["bao", "gói", "phần", "hộp", "thùng", "đơn", "sản phẩm"]):
                entities["customer_name"] = extracted_name
                break

    # 3. Extract items ONLY from user_text (never from context_part!)
    stop_skus = {
        "CHO", "KH", "DON", "TAO", "LEN", "VUI", "LONG", "BAN", "MUA", "OD", "S02", "SDT",
        "HANG", "KHACH", "THONG", "TIN", "NAY", "NGAY", "GIO", "PHUT", "GIAY", "NAM", "THANG",
        "TRONG", "THEO", "CUA", "HOI", "DAP", "XEM", "DOC", "GUI", "NHAN", "CO", "CHUA", "ROI"
    }

    matched_spans: List[tuple[int, int]] = []

    # Pattern 1: (qty) (unit)? (sku) e.g. "5 bao BO3", "10 gói E01", "3 C24"
    p1 = r"\b(\d{1,5})\s*(?:bao|gói|túi|hộp|thùng|phần|cái|lon|kg|lon)?\s*([A-Za-z][A-Za-z0-9_-]{1,8})\b"
    for match in re.finditer(p1, user_text, re.IGNORECASE):
        span = match.span()
        matched_spans.append(span)
        qty = int(match.group(1))
        sku = match.group(2).upper()
        if sku not in stop_skus and len(sku) >= 2:
            entities["items"].append({"sku": sku, "qty": max(1, qty)})

    # Pattern 2: (sku) (x|sl)? (qty) e.g. "BO3 x 5", "E01 10" (only for unmatched spans)
    p2 = r"\b([A-Za-z][A-Za-z0-9_-]{1,8})\s*(?:x|số\s*lượng|sl)?\s*(\d{1,5})\b"
    for match in re.finditer(p2, user_text, re.IGNORECASE):
        span = match.span()
        if any(s[0] <= span[0] < s[1] or s[0] < span[1] <= s[1] for s in matched_spans):
            continue
        sku = match.group(1).upper()
        qty = int(match.group(2))
        if sku not in stop_skus and len(sku) >= 2:
            entities["items"].append({"sku": sku, "qty": max(1, qty)})

    return entities


def parse_sql_tool_result(result_text: str) -> Dict[str, Any]:
    """
    Parse SQL query tool results (CSV / JSON preview) to extract structured records.
    """
    parsed: Dict[str, Any] = {
        "customers": [],
        "products": [],
        "orders": [],
        "raw_rows": []
    }

    if not result_text or "No rows returned" in result_text or "error" in result_text.lower():
        return parsed

    try:
        # Extract CSV or JSON from tool output
        lines = result_text.strip().split("\n")
        csv_lines = [l for l in lines if not l.startswith("Results saved to file:") and not l.startswith("Preview:")]
        if not csv_lines:
            return parsed

        import csv
        import io
        reader = csv.DictReader(io.StringIO("\n".join(csv_lines)))
        rows = list(reader)
        parsed["raw_rows"] = rows

        for r in rows:
            # Check if row is a customer record
            if "odoo_partner_id" in r or "full_address" in r or ("name" in r and "phone" in r):
                parsed["customers"].append({
                    "id": r.get("id") or r.get("odoo_partner_id"),
                    "odoo_partner_id": r.get("odoo_partner_id") or r.get("id"),
                    "name": r.get("name") or r.get("partner_name"),
                    "phone": r.get("phone"),
                    "email": r.get("email"),
                    "address": r.get("full_address") or r.get("address"),
                })

            # Check if row is a product record
            if "sku" in r or "list_price" in r or "wholesale_price" in r or "specification" in r:
                price = float(r.get("wholesale_price") or r.get("list_price") or r.get("price") or 0)
                parsed["products"].append({
                    "id": r.get("id") or r.get("odoo_id"),
                    "odoo_id": r.get("odoo_id") or r.get("id"),
                    "sku": r.get("sku") or r.get("default_code"),
                    "name": r.get("name"),
                    "price": price,
                    "specification": r.get("specification") or r.get("weight"),
                })

            # Check if row is an order record
            if "order_code" in r or "amount_total" in r:
                parsed["orders"].append(r)

    except Exception as e:
        logger.debug(f"Error parsing SQL tool result: {e}")

    return parsed


class WorkflowEngine:
    """
    Core deterministic workflow engine.
    Controls state transitions, ensures database checks before asking questions,
    and prevents redundant entity prompts.
    """

    @staticmethod
    def update_state_from_turn(
        state: ConversationWorkflowState,
        user_message: str,
        tool_results_list: Optional[List[Dict[str, Any]]] = None
    ) -> ConversationWorkflowState:
        """
        Update workflow state based on incoming message and executed tool results.
        """
        state.iteration_count += 1
        state.updated_at = datetime.now(timezone.utc)

        # 1. Detect intent
        new_intent = detect_intent(user_message, state.intent)
        state.intent = new_intent

        # 2. Reset order items and draft if intent is not CREATE_ORDER
        if new_intent != "CREATE_ORDER":
            state.items = []
            state.missing_fields = []
            state.order_draft = None
            if new_intent in ["QUERY_DATA", "CUSTOMER_INFO"]:
                state.workflow_status = WorkflowStatus.PROCESSING
            else:
                state.workflow_status = WorkflowStatus.COMPLETED

        # 3. Extract raw entities from user message
        extracted = extract_raw_entities_from_text(user_message)

        if extracted.get("customer_name") or extracted.get("phone") or extracted.get("odoo_partner_id"):
            if not state.customer:
                state.customer = CustomerInfo(
                    odoo_partner_id=extracted.get("odoo_partner_id"),
                    name=extracted.get("customer_name"),
                    phone=extracted.get("phone"),
                    address=extracted.get("address"),
                    source="text" if not extracted.get("odoo_partner_id") else "context"
                )
            else:
                if extracted.get("customer_name"):
                    state.customer.name = extracted["customer_name"]
                if extracted.get("phone"):
                    state.customer.phone = extracted["phone"]
                if extracted.get("odoo_partner_id"):
                    state.customer.odoo_partner_id = extracted["odoo_partner_id"]
                if extracted.get("address"):
                    state.customer.address = extracted["address"]

        if new_intent == "CREATE_ORDER" and extracted.get("items"):
            # Merge or set items
            for item in extracted["items"]:
                existing = next((it for it in state.items if (it.sku and it.sku.upper() == item["sku"].upper())), None)
                if existing:
                    existing.qty = item["qty"]
                else:
                    state.items.append(OrderItem(
                        sku=item["sku"],
                        name=f"Sản phẩm {item['sku']}",
                        qty=item["qty"],
                        price=0.0
                    ))

        # 4. Parse tool results if any
        if tool_results_list:
            for tr in tool_results_list:
                content = tr.get("content", "")
                parsed = parse_sql_tool_result(content)

                # Merge customer info from DB
                if parsed["customers"]:
                    db_cust = parsed["customers"][0]
                    if not state.customer:
                        state.customer = CustomerInfo(
                            id=db_cust.get("id"),
                            odoo_partner_id=db_cust.get("odoo_partner_id"),
                            name=db_cust.get("name"),
                            phone=db_cust.get("phone"),
                            email=db_cust.get("email"),
                            address=db_cust.get("address"),
                            source="database"
                        )
                    else:
                        state.customer.id = db_cust.get("id") or state.customer.id
                        state.customer.odoo_partner_id = db_cust.get("odoo_partner_id") or state.customer.odoo_partner_id
                        state.customer.name = db_cust.get("name") or state.customer.name
                        state.customer.phone = db_cust.get("phone") or state.customer.phone
                        state.customer.address = db_cust.get("address") or state.customer.address
                        state.customer.source = "database"

                # Merge product info from DB ONLY for CREATE_ORDER intent
                if new_intent == "CREATE_ORDER" and parsed["products"]:
                    for db_prod in parsed["products"]:
                        sku = db_prod.get("sku")
                        matched_item = next((it for it in state.items if it.sku and sku and it.sku.upper() == sku.upper()), None)
                        if matched_item:
                            matched_item.product_id = db_prod.get("id")
                            matched_item.odoo_id = db_prod.get("odoo_id")
                            matched_item.name = db_prod.get("name") or matched_item.name
                            matched_item.price = db_prod.get("price") or matched_item.price
                        elif len(state.items) == 0:
                            # Direct product match without prior items
                            state.items.append(OrderItem(
                                product_id=db_prod.get("id"),
                                odoo_id=db_prod.get("odoo_id"),
                                sku=db_prod.get("sku"),
                                name=db_prod.get("name"),
                                qty=1,
                                price=db_prod.get("price") or 0.0
                            ))

        # 5. Evaluate Workflow Completeness
        WorkflowEngine.evaluate_workflow_status(state)
        return state

    @staticmethod
    def evaluate_workflow_status(state: ConversationWorkflowState) -> None:
        """
        Evaluate workflow status and compute missing_fields deterministically.
        """
        if state.intent == "CREATE_ORDER":
            missing = []

            # Check customer
            has_customer = bool(
                state.customer and (
                    state.customer.odoo_partner_id or
                    state.customer.id or
                    (state.customer.name and len(state.customer.name.strip()) > 1) or
                    state.customer.phone
                )
            )
            if not has_customer:
                missing.append("customer")

            # Check items
            has_items = bool(state.items and len(state.items) > 0 and all(it.qty >= 1 for it in state.items))
            if not has_items:
                missing.append("product_or_quantity")

            state.missing_fields = missing

            if len(missing) == 0:
                state.workflow_status = WorkflowStatus.COMPLETED
                state.order_draft = WorkflowEngine.build_order_draft_dict(state)
            else:
                state.workflow_status = WorkflowStatus.WAITING_FOR_USER
        elif state.intent in ["QUERY_DATA", "CUSTOMER_INFO"]:
            # Query intents complete when data is fetched
            state.workflow_status = WorkflowStatus.COMPLETED if state.tool_results else WorkflowStatus.PROCESSING
        else:
            state.workflow_status = WorkflowStatus.COMPLETED

    @staticmethod
    def build_order_draft_dict(state: ConversationWorkflowState) -> Dict[str, Any]:
        """Build standard [ORDER_DRAFT] JSON payload from state."""
        cust = state.customer or CustomerInfo(name="Khách hàng")
        items_payload = []
        for it in state.items:
            items_payload.append({
                "product": {
                    "id": it.odoo_id or it.product_id or 1001,
                    "name": it.name or f"Sản phẩm {it.sku or 'N/A'}",
                    "sku": it.sku or "N/A",
                    "default_code": it.sku or "N/A",
                    "list_price": it.price or 0.0,
                },
                "qty": it.qty,
                "price": it.price or 0.0
            })

        return {
            "customer": {
                "id": cust.odoo_partner_id or cust.id,
                "name": cust.name or "Khách hàng",
                "phone": cust.phone or "",
                "shippingAddress": cust.address or ""
            },
            "items": items_payload,
            "workflow_status": "COMPLETED"
        }

    @staticmethod
    def generate_order_draft_text(state: ConversationWorkflowState) -> str:
        """Render [ORDER_DRAFT] markdown text for UI consumption."""
        draft = state.order_draft or WorkflowEngine.build_order_draft_dict(state)
        json_str = json.dumps(draft, ensure_ascii=False, indent=2)
        cust_name = draft["customer"].get("name") or "Khách hàng"

        return (
            f"Dưới đây là thông tin đơn hàng đã được chuẩn bị cho **{cust_name}**:\n\n"
            f"[ORDER_DRAFT]\n"
            f"{json_str}\n"
            f"[/ORDER_DRAFT]\n\n"
            f"Bạn có thể điều chỉnh số lượng trực tiếp trên phiếu đơn hàng ở trên hoặc bấm **Xác nhận tạo đơn Odoo** nhé! 😊"
        )
