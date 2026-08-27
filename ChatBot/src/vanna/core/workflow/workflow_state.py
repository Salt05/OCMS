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


def detect_intent(message: str, current_intent: Optional[str] = None) -> str:
    """Detect the user intent from text."""
    if not message:
        return current_intent or "GENERAL_CHAT"

    msg_lower = message.lower().strip()

    # Order creation keywords
    order_keywords = [
        "lên đơn", "len don", "tạo đơn", "tao don", "lập đơn", "lap don",
        "đặt đơn", "dat don", "đặt hàng", "dat hang", "bóc tách đơn", "boc tach don",
        "tạo order", "lên order", "order nháp", "lên đơn hàng"
    ]
    if any(kw in msg_lower for kw in order_keywords) or "[yêu cầu tạo đơn hàng" in msg_lower:
        return "CREATE_ORDER"

    # Customer lookup keywords
    customer_keywords = [
        "thông tin khách", "tìm khách", "tra cứu khách", "khách hàng này",
        "hồ sơ khách", "doanh thu của khách", "lịch sử mua hàng của khách"
    ]
    if any(kw in msg_lower for kw in customer_keywords):
        return "CUSTOMER_INFO"

    # Data query keywords
    query_keywords = [
        "select", "doanh thu", "tổng tiền", "thống kê", "báo cáo",
        "sản phẩm nào", "bán chạy", "tồn kho", "danh sách đơn"
    ]
    if any(kw in msg_lower for kw in query_keywords):
        return "QUERY_DATA"

    return current_intent or "GENERAL_CHAT"


def extract_raw_entities_from_text(text: str) -> Dict[str, Any]:
    """
    Extract customer name, SKUs, quantities, and phone numbers from user text.
    """
    if not text:
        return {}

    entities: Dict[str, Any] = {
        "customer_name": None,
        "phone": None,
        "items": []
    }

    # Extract phone number
    phone_match = re.search(r"\b(0[3|5|7|8|9][0-9]{8})\b", text)
    if phone_match:
        entities["phone"] = phone_match.group(1)

    # Extract customer name following 'cho khách hàng', 'cho khách', 'cho anh/chị', 'cho'
    customer_patterns = [
        r"(?:cho khách hàng|cho khách|cho KH|cho anh|cho chị|cho bác|cho cô|cho chú)\s+([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:\s+(?:sđt|đt|sdt|ở|tại|với|gồm|nhé|nha|ạ|\.|\,|$))",
        r"(?:khách hàng|khách|KH):\s*([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:\s+(?:sđt|đt|sdt|ở|tại|với|gồm|nhé|nha|ạ|\.|\,|$))",
        r"\bcho\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)+)",  # Capitalized Vietnamese Name
    ]
    for pattern in customer_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            extracted_name = match.group(1).strip()
            # Filter out non-names like product names or stop words
            if len(extracted_name.split()) <= 5 and not any(w in extracted_name.lower() for w in ["bao", "gói", "phần", "hộp", "thùng", "đơn"]):
                entities["customer_name"] = extracted_name
                break

    # Extract items: e.g. "5 bao BO3", "10 gói E01", "50 phần B03", "3 C24"
    matched_spans: List[tuple[int, int]] = []

    # Pattern 1: (qty) (unit)? (sku) e.g. "5 bao BO3", "10 gói E01", "3 C24"
    p1 = r"\b(\d+)\s*(?:bao|gói|túi|hộp|thùng|phần|cái|lon|kg|lon)?\s*([A-Za-z][A-Za-z0-9_-]{1,8})\b"
    for match in re.finditer(p1, text, re.IGNORECASE):
        span = match.span()
        matched_spans.append(span)
        qty = int(match.group(1))
        sku = match.group(2).upper()
        if sku not in ["CHO", "KH", "DON", "TAO", "LEN", "VUI", "LONG", "BAN", "MUA", "OD", "S02", "SDT"]:
            entities["items"].append({"sku": sku, "qty": max(1, qty)})

    # Pattern 2: (sku) (x|sl)? (qty) e.g. "BO3 x 5", "E01 10" (only for unmatched spans)
    p2 = r"\b([A-Za-z][A-Za-z0-9_-]{1,8})\s*(?:x|số\s*lượng|sl)?\s*(\d+)\b"
    for match in re.finditer(p2, text, re.IGNORECASE):
        span = match.span()
        if any(s[0] <= span[0] < s[1] or s[0] < span[1] <= s[1] for s in matched_spans):
            continue
        sku = match.group(1).upper()
        qty = int(match.group(2))
        if sku not in ["CHO", "KH", "DON", "TAO", "LEN", "VUI", "LONG", "BAN", "MUA", "OD", "S02", "SDT"]:
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

        # 1. Detect or preserve intent
        new_intent = detect_intent(user_message, state.intent)
        if new_intent:
            state.intent = new_intent

        # 2. Extract raw entities from user message
        extracted = extract_raw_entities_from_text(user_message)

        if extracted.get("customer_name"):
            if not state.customer:
                state.customer = CustomerInfo(name=extracted["customer_name"], source="text")
            else:
                state.customer.name = extracted["customer_name"]

        if extracted.get("phone"):
            if not state.customer:
                state.customer = CustomerInfo(phone=extracted["phone"], source="text")
            else:
                state.customer.phone = extracted["phone"]

        if extracted.get("items"):
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

        # 3. Parse tool results if any
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

                # Merge product info from DB
                if parsed["products"]:
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

        # 4. Evaluate Workflow Completeness
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
