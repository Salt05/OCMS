"""
Order Workflow Guard and Anti-Looping Controller.

Enforces business state rules, prevents redundant prompts, and terminates agent loops
immediately when workflows reach COMPLETED or WAITING_FOR_USER states.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from .workflow_state import (
    ConversationWorkflowState,
    WorkflowEngine,
    WorkflowStatus,
)

logger = logging.getLogger("vanna.order_workflow_guard")


class OrderWorkflowGuard:
    """
    Workflow guard ensuring strict separation between LLM reasoning and backend validation.
    Enforces state-driven decision making and guards against hallucinated missing fields.
    """

    @staticmethod
    def check_guard(
        state: ConversationWorkflowState,
        latest_user_message: str,
        tool_results_list: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluate workflow guard.
        Returns:
            Tuple of (should_stop_agent_loop: bool, final_response: Optional[str])
        """
        # Update state with latest information
        WorkflowEngine.update_state_from_turn(state, latest_user_message, tool_results_list)

        logger.info(
            f"[WorkflowGuard] intent={state.intent} status={state.workflow_status} "
            f"missing={state.missing_fields} customer={state.customer.name if state.customer else None} "
            f"items_count={len(state.items)}"
        )

        # Only apply Order Guard when intent is CREATE_ORDER
        if state.intent != "CREATE_ORDER":
            return False, None

        # 1. State is COMPLETED -> Immediately emit ORDER_DRAFT and STOP
        if state.workflow_status == WorkflowStatus.COMPLETED:
            logger.info("[WorkflowGuard] Workflow COMPLETED. Stopping agent loop and emitting ORDER_DRAFT.")
            draft_text = WorkflowEngine.generate_order_draft_text(state)
            return True, draft_text

        # 2. State is WAITING_FOR_USER -> Ask ONLY for missing fields and STOP
        if state.workflow_status == WorkflowStatus.WAITING_FOR_USER:
            # Case A: Missing customer only
            if "customer" in state.missing_fields and "product_or_quantity" not in state.missing_fields:
                items_summary = ", ".join([f"{it.qty} {it.sku or it.name}" for it in state.items])
                question = f"Bạn muốn đặt đơn ({items_summary}) này cho ai? Cho mình biết Tên khách hàng (hoặc SĐT) để mình hỗ trợ lên đơn nhé! 😊"
                logger.info(f"[WorkflowGuard] Missing customer only. Stopping loop and asking: {question}")
                return True, question

            # Case B: Missing product or quantity only
            if "product_or_quantity" in state.missing_fields and "customer" not in state.missing_fields:
                cust_name = state.customer.name if state.customer else "khách hàng"
                question = f"Bạn muốn lên đơn sản phẩm gì và số lượng bao nhiêu cho khách hàng **{cust_name}** ạ? 😊"
                logger.info(f"[WorkflowGuard] Missing product/qty only for customer {cust_name}. Stopping loop.")
                return True, question

            # Case C: Missing both
            question = "Bạn muốn lên đơn sản phẩm nào và đặt cho khách hàng nào ạ? Cho mình biết chi tiết để mình hỗ trợ nhé! 😊"
            return True, question

        return False, None
