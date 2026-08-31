"""
Comprehensive Regression Tests for Chatbot Conversation State & Workflow Guard.

Tests all 5 mandatory cases:
Case 1: lên đơn 5 bao BO3 cho Nguyễn Tấn Dũng -> finds customer & product -> COMPLETED -> emits [ORDER_DRAFT] -> STOP
Case 2: lên đơn 5 bao BO3 -> missing customer -> asks only customer
Case 3: lên đơn cho Nguyễn Tấn Dũng -> missing product / quantity -> asks only product/qty
Case 4: Customer exists in DB without phone -> uses DB record -> NO phone prompt
Case 5: Workflow COMPLETED -> stops loop immediately without further tool calls or questions
"""

import sys
import os
import unittest

# Ensure src is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from vanna.core.workflow.workflow_state import (
    WorkflowStatus,
    ConversationWorkflowState,
    CustomerInfo,
    OrderItem,
    WorkflowEngine,
    detect_intent,
    extract_raw_entities_from_text,
    parse_sql_tool_result,
)
from vanna.core.workflow.order_workflow_guard import OrderWorkflowGuard


class TestChatbotWorkflowGuard(unittest.TestCase):
    """Regression test suite for chatbot state machine and workflow guards."""

    def test_case_1_full_order_with_customer_and_product(self):
        """
        Case 1: User says 'lên đơn 5 bao BO3 cho Nguyễn Tấn Dũng'
        Expected:
        - Customer is extracted ('Nguyễn Tấn Dũng')
        - Tool execution returns DB record for customer and product
        - State transitions to COMPLETED
        - Emits [ORDER_DRAFT]
        - Agent loop STOPS immediately without asking for customer again
        """
        state = ConversationWorkflowState()
        user_msg = "lên đơn 5 bao BO3 cho Nguyễn Tấn Dũng"

        # Mock SQL tool result simulating DB lookups
        tool_results = [
            {
                "tool_call_id": "call_1",
                "content": (
                    "Results saved to file: query_results_cust.csv\nPreview:\n"
                    "id,odoo_partner_id,name,phone,email,full_address\n"
                    "123,17864,Nguyễn Tấn Dũng,0979028480,dung@example.com,TP. Hồ Chí Minh"
                )
            },
            {
                "tool_call_id": "call_2",
                "content": (
                    "Results saved to file: query_results_prod.csv\nPreview:\n"
                    "id,odoo_id,sku,name,wholesale_price,list_price,specification\n"
                    "3245,3245,BO3,Que hương sữa 5kg,23400,25000,5kg"
                )
            }
        ]

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, tool_results)

        # Assertions
        self.assertTrue(should_stop, "Workflow guard must stop loop when completed")
        self.assertIsNotNone(response, "Must emit final response")
        self.assertEqual(state.workflow_status, WorkflowStatus.COMPLETED)
        self.assertEqual(state.intent, "CREATE_ORDER")
        self.assertEqual(state.customer.name, "Nguyễn Tấn Dũng")
        self.assertEqual(state.customer.phone, "0979028480")
        self.assertEqual(state.customer.odoo_partner_id, "17864")
        self.assertEqual(len(state.items), 1)
        self.assertEqual(state.items[0].sku, "BO3")
        self.assertEqual(state.items[0].qty, 5)
        self.assertEqual(len(state.missing_fields), 0)

        # Response must contain [ORDER_DRAFT] and MUST NOT ask for customer info
        self.assertIn("[ORDER_DRAFT]", response)
        self.assertIn("Nguyễn Tấn Dũng", response)
        self.assertNotIn("Bạn muốn đặt đơn này cho ai", response)
        self.assertNotIn("Bạn cho mình biết Tên và Số điện thoại", response)

    def test_case_2_missing_customer_only(self):
        """
        Case 2: User says 'lên đơn 5 bao BO3'
        Expected:
        - Product & quantity identified (BO3, qty: 5)
        - Customer is missing
        - Status: WAITING_FOR_USER, missing_fields: ['customer']
        - Asks ONLY for customer name, does NOT ask for product again
        - Loop stops to wait for user
        """
        state = ConversationWorkflowState()
        user_msg = "lên đơn 5 bao BO3"

        # Mock SQL tool result for product only
        tool_results = [
            {
                "tool_call_id": "call_prod",
                "content": (
                    "id,odoo_id,sku,name,list_price\n"
                    "3245,3245,BO3,Que hương sữa 5kg,23400"
                )
            }
        ]

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, tool_results)

        self.assertTrue(should_stop)
        self.assertEqual(state.workflow_status, WorkflowStatus.WAITING_FOR_USER)
        self.assertIn("customer", state.missing_fields)
        self.assertNotIn("product_or_quantity", state.missing_fields)
        self.assertIn("Bạn muốn đặt đơn (5 BO3) này cho ai", response)

    def test_case_3_missing_product_and_quantity_only(self):
        """
        Case 3: User says 'lên đơn cho Nguyễn Tấn Dũng'
        Expected:
        - Customer identified ('Nguyễn Tấn Dũng')
        - Missing product / quantity
        - Status: WAITING_FOR_USER, missing_fields: ['product_or_quantity']
        - Asks ONLY for product/quantity for that specific customer
        - NEVER asks for customer name again
        """
        state = ConversationWorkflowState()
        user_msg = "lên đơn cho Nguyễn Tấn Dũng"

        tool_results = [
            {
                "tool_call_id": "call_cust",
                "content": (
                    "id,odoo_partner_id,name,phone,full_address\n"
                    "123,17864,Nguyễn Tấn Dũng,0979028480,TP. Hồ Chí Minh"
                )
            }
        ]

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, tool_results)

        self.assertTrue(should_stop)
        self.assertEqual(state.workflow_status, WorkflowStatus.WAITING_FOR_USER)
        self.assertIn("product_or_quantity", state.missing_fields)
        self.assertNotIn("customer", state.missing_fields)
        self.assertIn("Nguyễn Tấn Dũng", response)
        self.assertIn("sản phẩm gì và số lượng bao nhiêu", response)
        self.assertNotIn("Bạn muốn đặt đơn này cho ai", response)

    def test_case_4_customer_in_db_without_phone(self):
        """
        Case 4: Customer exists in DB without phone number, user does not provide phone
        Expected:
        - Uses database record (odoo_partner_id / name)
        - Does NOT demand phone number from user
        - Status: COMPLETED
        """
        state = ConversationWorkflowState()
        user_msg = "lên đơn 10 gói E01 cho khách hàng Trần Văn An"

        # Customer record in DB with NULL phone
        tool_results = [
            {
                "tool_call_id": "call_c",
                "content": (
                    "id,odoo_partner_id,name,phone,full_address\n"
                    "999,5555,Trần Văn An,,Hà Nội"
                )
            },
            {
                "tool_call_id": "call_p",
                "content": (
                    "id,odoo_id,sku,name,list_price\n"
                    "101,101,E01,Xương sữa dê 100g,45000"
                )
            }
        ]

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, tool_results)

        self.assertTrue(should_stop)
        self.assertEqual(state.workflow_status, WorkflowStatus.COMPLETED)
        self.assertEqual(len(state.missing_fields), 0)
        self.assertIn("[ORDER_DRAFT]", response)
        self.assertIn("Trần Văn An", response)
        self.assertNotIn("Số điện thoại", response)

    def test_case_5_completed_workflow_guard_stops_agent(self):
        """
        Case 5: Workflow is COMPLETED
        Expected:
        - Guard returns should_stop = True
        - Final response contains complete [ORDER_DRAFT] JSON
        - No further tool iterations are executed
        """
        state = ConversationWorkflowState(
            intent="CREATE_ORDER",
            workflow_status=WorkflowStatus.COMPLETED,
            customer=CustomerInfo(name="Nguyễn Tấn Dũng", odoo_partner_id="17864", phone="0979028480"),
            items=[OrderItem(sku="BO3", name="Que hương sữa 5kg", qty=5, price=23400)]
        )

        should_stop, response = OrderWorkflowGuard.check_guard(state, "xác nhận lại đơn")

        self.assertTrue(should_stop)
        self.assertEqual(state.workflow_status, WorkflowStatus.COMPLETED)
        self.assertIn("[ORDER_DRAFT]", response)
        self.assertIn("BO3", response)
        self.assertIn('"qty": 5', response)

    def test_case_6_agent_loop_workflow_guard_integration(self):
        """
        Case 6: Full Agent.send_message integration test with simulated LLM tool calls.
        Verifies that after the SQL tool returns customer + product data,
        the workflow guard intercepts the loop, outputs the [ORDER_DRAFT],
        updates conversation.metadata['workflow_state'], and halts further LLM iterations.
        """
        import asyncio
        from vanna.core.agent.agent import Agent
        from vanna.core.llm.models import LlmResponse
        from vanna.core.llm.base import LlmService
        from vanna.core.tool.models import ToolCall, ToolResult
        from vanna.core.tool.base import Tool
        from vanna.core.registry import ToolRegistry
        from vanna.core.user.models import User
        from vanna.core.user.request_context import RequestContext
        from vanna.core.user.resolver import UserResolver
        from vanna.capabilities.agent_memory import AgentMemory
        from vanna.integrations.local import MemoryConversationStore
        from pydantic import BaseModel

        class DummyArgs(BaseModel):
            sql: str = "SELECT 1"

        class MockSqlTool(Tool[DummyArgs]):
            @property
            def name(self) -> str:
                return "run_sql"
            @property
            def description(self) -> str:
                return "Run SQL"
            def get_args_schema(self):
                return DummyArgs
            async def execute(self, context, args):
                return ToolResult(
                    success=True,
                    result_for_llm=(
                        "Results saved to file: results.csv\nPreview:\n"
                        "id,odoo_partner_id,name,phone,sku,list_price\n"
                        "123,17864,Nguyễn Tấn Dũng,0979028480,BO3,23400"
                    )
                )

        class MockLlmService(LlmService):
            def __init__(self):
                self.call_count = 0
            async def send_request(self, request):
                self.call_count += 1
                if self.call_count == 1:
                    # Return tool call for SQL lookup
                    return LlmResponse(
                        content="Đang tra cứu thông tin khách hàng và sản phẩm...",
                        tool_calls=[
                            ToolCall(
                                id="call_sql_1",
                                name="run_sql",
                                arguments={"sql": "SELECT * FROM customer_profiles WHERE name ILIKE '%Nguyễn Tấn Dũng%'"}
                            )
                        ]
                    )
                # Second call should NOT be reached if guard works!
                return LlmResponse(content="Lỗi: Vòng lặp không được dừng lại!")

            async def stream_request(self, request):
                resp = await self.send_request(request)
                from vanna.core.llm.models import LlmStreamChunk
                yield LlmStreamChunk(content=resp.content, tool_calls=resp.tool_calls)

            async def validate_tools(self, tools):
                return []

        class SimpleUserResolver(UserResolver):
            async def resolve_user(self, request_context):
                return User(id="user_1", email="user@example.com", group_memberships=["user"])

        async def run_test():
            from vanna.integrations.local.agent_memory import DemoAgentMemory
            tool_reg = ToolRegistry()
            tool_reg.register_local_tool(MockSqlTool(), access_groups=[])
            llm_mock = MockLlmService()
            conv_store = MemoryConversationStore()
            agent = Agent(
                llm_service=llm_mock,
                tool_registry=tool_reg,
                user_resolver=SimpleUserResolver(),
                agent_memory=DemoAgentMemory(),
                conversation_store=conv_store,
            )

            req_ctx = RequestContext()
            components = []
            async for comp in agent.send_message(req_ctx, "lên đơn 5 bao BO3 cho Nguyễn Tấn Dũng", conversation_id="conv_test_1"):
                components.append(comp)

            # Retrieve saved conversation
            user = User(id="user_1", email="user@example.com")
            conv = await conv_store.get_conversation("conv_test_1", user)

            return components, conv, llm_mock.call_count

        components, conv, llm_calls = asyncio.run(run_test())

        # Assertions
        self.assertEqual(llm_calls, 1, "LLM should only be called once; guard must prevent redundant second iteration")
        self.assertIsNotNone(conv, "Conversation must be saved")
        self.assertIn("workflow_state", conv.metadata, "workflow_state must be persisted in conversation metadata")
        saved_state = conv.metadata["workflow_state"]
        self.assertEqual(saved_state["workflow_status"], "COMPLETED")
        self.assertEqual(saved_state["customer"]["name"], "Nguyễn Tấn Dũng")

        # Check that assistant response has [ORDER_DRAFT]
        last_msg = conv.messages[-1]
        self.assertEqual(last_msg.role, "assistant")
        self.assertIn("[ORDER_DRAFT]", last_msg.content)
        self.assertIn("Nguyễn Tấn Dũng", last_msg.content)
        self.assertNotIn("Bạn muốn đặt đơn này cho ai", last_msg.content)

    def test_case_7_customer_info_query_never_hijacked(self):
        """
        Case 7: User asks 'thông tin về khách hàng này' in context containing customer details
        and past message thread with items/numbers.
        Expected:
        - Intent must be CUSTOMER_INFO (NOT CREATE_ORDER)
        - Guard should_stop must be FALSE
        - No [ORDER_DRAFT] emitted
        - items must be empty
        """
        state = ConversationWorkflowState()
        user_msg = (
            "[NGỮ CẢNH HỘI THOẠI HIỆN TẠI]:\n"
            "- Khách hàng: Võ Tấn Dũng (Tên Zalo: Võ Tấn Dũng)\n"
            "- Số điện thoại: 0979028480\n"
            "- Địa chỉ: 123 Lê Lợi, TP.HCM\n"
            "- Mã khách hàng Odoo (Partner ID): 17864\n"
            "- Mã CRM Contact ID: crm_999\n"
            "- Nhân viên đang phụ trách/chat: Admin\n"
            "- Các tin nhắn gần nhất giữa nhân viên và khách hàng trong hội thoại này:\n"
            "+ [09:15] Khách hàng: Cho mình 235 bao E-4A6C-, 118552 kg A24678, 6 cái C1F1D01, 8 cái AF8\n"
            "+ [09:20] Nhân viên: Dạ em kiểm tra kho ạ\n\n"
            "[CÂU HỎI / YÊU CẦU CỦA NHÂN VIÊN]: thông tin về khách hàng này"
        )

        tool_results = [
            {
                "tool_call_id": "call_cust_info",
                "content": (
                    "id,odoo_partner_id,name,phone,email,full_address,total_orders,total_revenue\n"
                    "123,17864,Võ Tấn Dũng,0979028480,dung@example.com,123 Lê Lợi,12,150000000"
                )
            }
        ]

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, tool_results)

        self.assertFalse(should_stop, "OrderWorkflowGuard must NOT stop loop for CUSTOMER_INFO intent")
        self.assertIsNone(response, "No guard response should be emitted for CUSTOMER_INFO")
        self.assertEqual(state.intent, "CUSTOMER_INFO")
        self.assertEqual(len(state.items), 0, "No order items should be extracted from context messages")
        self.assertEqual(state.customer.name, "Võ Tấn Dũng")
        self.assertEqual(state.customer.phone, "0979028480")
        self.assertEqual(state.customer.odoo_partner_id, "17864")

    def test_case_8_order_mode_then_customer_info_resets_intent(self):
        """
        Case 8: Conversation state previously had CREATE_ORDER, now user asks about customer info.
        Expected:
        - Intent switches to CUSTOMER_INFO
        - items are cleared
        - Guard does not hijack
        """
        state = ConversationWorkflowState(
            intent="CREATE_ORDER",
            workflow_status=WorkflowStatus.COMPLETED,
            customer=CustomerInfo(name="Võ Tấn Dũng", odoo_partner_id="17864"),
            items=[OrderItem(sku="BO3", qty=5)]
        )

        user_msg = "[CÂU HỎI / YÊU CẦU CỦA NHÂN VIÊN]: lịch sử mua hàng của khách này"

        should_stop, response = OrderWorkflowGuard.check_guard(state, user_msg, [])

        self.assertFalse(should_stop)
        self.assertIsNone(response)
        self.assertEqual(state.intent, "CUSTOMER_INFO")
        self.assertEqual(len(state.items), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
