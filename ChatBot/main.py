import os
import sys
import uuid
import pandas as pd
from dotenv import load_dotenv

# Đảm bảo in tiếng Việt không bị lỗi trên Windows Terminal
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from vanna import Agent
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler
from vanna.core.user import UserResolver, User, RequestContext
from vanna.integrations.openai import OpenAILlmService
from vanna.tools import RunSqlTool
from vanna.integrations.duckdb import DuckDBRunner
from vanna.core.registry import ToolRegistry
from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory
from vanna.core.system_prompt.default import DefaultSystemPromptBuilder
from vanna.core.storage.models import Message

# Tải biến môi trường
load_dotenv()

# ==============================================================================
# 1. KẾT NỐI POSTGRESQL (THAY CHO DUCKDB/EXCEL)
# ==============================================================================
from vanna.integrations.postgres import PostgresRunner

DB_USER = os.getenv("DB_USER", "crmuser")
DB_PASSWORD = os.getenv("DB_PASSWORD", "zalocrm_secure_password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5433")
DB_NAME = os.getenv("DB_NAME", "zalocrm")

print(f"Đang kết nối tới CSDL PostgreSQL: {DB_HOST}:{DB_PORT}/{DB_NAME}...")
postgres_runner = PostgresRunner(
    host=DB_HOST,
    port=int(DB_PORT),
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD
)
print("-> Kết nối PostgreSQL thành công!")

loaded_tables_summary = [
    '- Bảng "contacts": id, full_name, zalo_name, phone, email, address, notes, tags, status',
    '- Bảng "customer_profiles": id, odoo_partner_id, name, phone, email, full_address, total_orders, total_revenue',
    '- Bảng "order_histories": id, odoo_order_id, order_code, partner_name, date_order, state, amount_total',
    '- Bảng "order_line_histories": id, order_history_id, product_name, quantity, price_unit, price_subtotal',
    '- Bảng "product_cache": id, odoo_id, sku, name, list_price, specification'
]

# ==============================================================================
# 2. CẤU HÌNH VÀ TẠO AGENT VANNA
# ==============================================================================
provider = os.getenv("LLM_PROVIDER", "groq").lower()

if provider == "groq":
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "your_groq_api_key_here":
        print("CẢNH BÁO: Chưa cấu hình GROQ_API_KEY trong file .env")
    
    llm = OpenAILlmService(
        model=os.getenv("MODEL_NAME", "openai/gpt-oss-120b"),
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
        temperature=0.1
    )
else:
    llm = OpenAILlmService(
        model=os.getenv("MODEL_NAME", "gpt-4o"),
        api_key=os.getenv("OPENAI_API_KEY"),
        temperature=0.1
    )

from vanna.tools import RunSqlTool, VisualizeDataTool
from vanna.tools.agent_memory import SearchSavedCorrectToolUsesTool, SaveQuestionToolArgsTool
from vanna.integrations.local import LocalFileSystem

# Đăng ký Tool chạy SQL, Trực quan hóa (Vẽ biểu đồ) và Bộ nhớ (Memory)
file_system = LocalFileSystem("./vanna_data")

tools = ToolRegistry()
tools.register_local_tool(RunSqlTool(sql_runner=postgres_runner, file_system=file_system), access_groups=[])
tools.register_local_tool(VisualizeDataTool(file_system=file_system), access_groups=[])
tools.register_local_tool(SearchSavedCorrectToolUsesTool(), access_groups=[])
tools.register_local_tool(SaveQuestionToolArgsTool(), access_groups=[])

schema_text = "\n".join(loaded_tables_summary)

dynamic_schema = f"""Bạn là Trợ lý AI Thông minh & Chuyên gia Phân tích Dữ liệu CRM của hệ thống ZaloCRM (kết nối cơ sở dữ liệu PostgreSQL và ERP Odoo).

HỆ THỐNG CƠ SỞ DỮ LIỆU ĐANG CÓ CÁC BẢNG SAU:
{schema_text}

MỐI QUAN HỆ & HƯỚNG DẪN TRUY VẤN DỮ LIỆU CÁC BẢNG:
1. Bảng 'contacts': Thông tin liên hệ khách hàng Zalo trong hệ thống CRM (cột: "id", "full_name", "zalo_name", "phone", "email", "address", "notes", "tags", "status").
2. Bảng 'customer_profiles': Hồ sơ khách hàng trên Odoo ERP (cột: "id", "odoo_partner_id", "name", "phone", "email", "full_address", "total_orders", "total_revenue").
   - Khi hỏi về thông tin khách hàng hoặc chi tiêu:
     + Tra cứu thông tin liên hệ: SELECT "id", "full_name", "zalo_name", "phone", "email", "address", "notes", "tags", "status" FROM "contacts" WHERE "full_name" ILIKE '%tên%' OR "phone" ILIKE '%sđt%' OR "id"::text = 'id'
     + Tra cứu doanh thu / số tiền đã chi: SELECT "name", "phone", "total_revenue", "total_orders", "odoo_partner_id" FROM "customer_profiles" WHERE "name" ILIKE '%tên%' OR "phone" ILIKE '%sđt%' OR "odoo_partner_id"::text = 'partner_id'
     + Hoặc tra cứu lịch sử đơn hàng: SELECT o."order_code", o."date_order", o."state", o."amount_total" FROM "order_histories" o JOIN "customer_profiles" c ON o."customer_profile_id" = c."id" WHERE c."name" ILIKE '%tên%' OR c."phone" ILIKE '%sđt%' OR c."odoo_partner_id"::text = 'partner_id' ORDER BY o."date_order" DESC
3. Bảng 'order_histories': Lịch sử mua hàng (đơn hàng). Khóa ngoại 'customer_profile_id' liên kết với 'customer_profiles.id'.
   - Khi hỏi về khách hàng chi tiêu nhiều nhất, top doanh thu: JOIN "order_histories" o với "customer_profiles" c qua o."customer_profile_id" = c."id" và tính SUM(o."amount_total").
4. Bảng 'order_line_histories': Chi tiết sản phẩm trong đơn. Khóa ngoại 'order_history_id' liên kết với 'order_histories.id'.
5. Bảng 'product_cache': Danh mục sản phẩm đồng bộ từ Odoo và Directus (cột: "id", "odoo_id", "sku", "name", "list_price", "specification").
6. Bảng 'messages' & 'conversations': Lịch sử tin nhắn trao đổi giữa nhân viên (sender_type = 'self') và khách hàng (sender_type = 'contact').

TÍNH NĂNG TẠO ĐƠN HÀNG & BÓC TÁCH TIN NHẮN TỰ ĐỘNG:
- Chatbot có khả năng tự động bóc tách tin nhắn Zalo của khách hàng và lập Form tạo đơn hàng trực tiếp ngay trong khung chat này.
- Khi người dùng nhắn các câu như: "tạo đơn cho khách này", "đọc lịch sử chat xem khách đặt gì", "lên đơn 5 bao B03", v.v., hệ thống sẽ tự động bóc tách và hiển thị phiếu đơn hàng có thể điều chỉnh số lượng và bấm tạo đơn ngay lập tức sang Odoo.

QUY TẮC BẮT BUỘC KHI VIẾT SQL:
1. Luôn đặt tên bảng và tên cột trong dấu ngoặc kép (ví dụ: SELECT c."name", SUM(o."amount_total") FROM "order_histories" o JOIN "customer_profiles" c ON o."customer_profile_id" = c."id" GROUP BY c."name").
2. QUY TRÌNH VẼ BIỂU ĐỒ (VISUALIZE):
   - CHỈ ĐƯỢC PHÉP gọi tool 'visualize_data' (vẽ biểu đồ) KHI VÀ CHỈ KHI người dùng CÓ YÊU CẦU RÕ RÀNG (ví dụ: "vẽ biểu đồ", "hiển thị sơ đồ", "chart", "graph", "plot").
   - NẾU NGƯỜI DÙNG KHÔNG YÊU CẦU: TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý VẼ BIỂU ĐỒ, chỉ trả về dữ liệu và câu trả lời text.
3. NGUYÊN TẮC TRẢ LỜI ĐẦY ĐỦ VÀ TOÀN DIỆN:
   - Luôn trả lời đầy đủ tất cả các vế trong câu hỏi, kèm số liệu cụ thể.
   - Phân tích chi tiết và trình bày rõ ràng (dùng Markdown tables, bullet points).
   - Trả lời bằng Tiếng Việt thân thiện, chính xác và chuyên nghiệp.
4. QUY TẮC BẮT BUỘC VỀ ĐỌC NGỮ CẢNH HỘI THOẠI & KHÁCH HÀNG:
   - Khi câu hỏi có kèm phần '[NGỮ CẢNH HỘI THOẠI HIỆN TẠI]:' hoặc '[NGỮ CẢNH KHÁCH HÀNG...]', bạn ĐÃ BIẾT RÕ NHÂN VIÊN ĐANG MỞ HỘI THOẠI VỚI KHÁCH HÀNG NÀO (Tên, SĐT, Địa chỉ, Mã Odoo Partner ID, Mã CRM Contact ID, Nhân viên phụ trách, và các tin nhắn gần nhất).
   - BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC yêu cầu nhân viên cung cấp lại Tên, Số điện thoại hoặc ID của khách hàng!
   - Khi nhân viên hỏi 'thông tin về khách hàng này', 'khách này đã mua gì', 'khách này đã chi bao nhiêu', 'lịch sử đơn hàng', 'khách này ở đâu', 'tìm thông tin khách':
     + BẮT BUỘC gọi tool 'run_sql' để tra cứu trong bảng 'contacts', 'customer_profiles', 'order_histories' theo tên/SĐT/ID có sẵn trong ngữ cảnh và trả về câu trả lời chi tiết và đầy đủ.
   - Khi nhân viên hỏi 'khách vừa nhắn gì', 'khách muốn đặt gì', 'tóm tắt cuộc trò chuyện', 'khách hỏi gì vậy':
     + Đọc kỹ danh sách các tin nhắn gần nhất đã được cung cấp trong phần '[NGỮ CẢNH HỘI THOẠI HIỆN TẠI]' để tóm tắt và phân tích chính xác ý định của khách hàng.
5. LINH HOẠT VÀ TỰ NHIÊN (CONVERSATIONAL FLEXIBILITY):
   - Nếu tin nhắn của người dùng thuần túy là lời chào, cảm ơn, khen ngợi (ví dụ: 'chào bạn', 'cảm ơn nhé') mà KHÔNG hỏi về dữ liệu hay thông tin gì, bạn hãy phản hồi ngắn gọn, tự nhiên và thân thiện mà không cần gọi tool SQL.
"""

# ==============================================================================
# 3. CƠ SỞ DỮ LIỆU LƯU TRỮ VÀ XÁC THỰC NGƯỜI DÙNG (DATABASE & AUTH)
# ==============================================================================
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Header, HTTPException, Depends, status
from pydantic import BaseModel
from vanna.integrations.local.sql_conversation_store import SqlConversationStore
from vanna.core.user.jwt_resolver import JwtUserResolver, create_access_token, decode_access_token

# Khởi tạo kho lưu trữ SQLite vĩnh viễn
conversation_store = SqlConversationStore(db_path="chatbot.db")

# User Resolver giải mã JWT từ Request
jwt_user_resolver = JwtUserResolver(
    fallback_user=User(id="guest_user", email="guest@example.com", username="Guest User", group_memberships=["user"])
)

agent_memory = DemoAgentMemory()
system_prompt_builder = DefaultSystemPromptBuilder(base_prompt=dynamic_schema)

agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=jwt_user_resolver,
    conversation_store=conversation_store,
    agent_memory=agent_memory,
    system_prompt_builder=system_prompt_builder
)

# ==============================================================================
# 4. CHẠY WEBSERVER BẰNG FASTAPI VÀ CÁC API ENDPOINTS
# ==============================================================================
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

app = FastAPI(title="Vanna AI Data Assistant with Multi-Device Chat History")

# Cấu hình CORS để frontend từ bất kỳ domain nào cũng có thể gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phục vụ file tĩnh (CSS, JS, Fonts)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=FileResponse)
async def get_index():
    """Trả về giao diện trang web độc lập Vanna AI."""
    return FileResponse("static/index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

# Khởi tạo Chat Handler và đăng ký API routes của Vanna (/api/vanna/v2/chat_sse)
chat_handler = ChatHandler(agent)
register_chat_routes(app, chat_handler)

# ------------------------------------------------------------------------------
# Auth Models & Dependency Helper
# ------------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: str
    password: str
    username: str | None = None

class LoginRequest(BaseModel):
    email: str
    password: str

async def get_current_user(authorization: str | None = Header(None)) -> User:
    """Dependency helper trả về người dùng mặc định (Bỏ xác thực)."""
    return User(
        id="guest_user",
        email="guest@example.com",
        username="Khách",
        group_memberships=["user"]
    )

# ------------------------------------------------------------------------------
# REST API: Authentication (Đăng ký / Đăng nhập / Lấy thông tin user)
# ------------------------------------------------------------------------------
@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    """Đăng ký tài khoản người dùng mới."""
    user_id = str(uuid.uuid4())
    try:
        user = await conversation_store.create_user(
            user_id=user_id,
            email=req.email,
            password=req.password,
            username=req.username,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email already registered or error: {str(e)}",
        )
    token = create_access_token({"sub": user.id, "email": user.email, "username": user.username})
    return {"status": "success", "access_token": token, "token_type": "bearer", "user": user.model_dump()}

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """Đăng nhập bằng Email và Mật khẩu để nhận JWT Token."""
    user = await conversation_store.authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )
    token = create_access_token({"sub": user.id, "email": user.email, "username": user.username})
    return {"status": "success", "access_token": token, "token_type": "bearer", "user": user.model_dump()}

@app.get("/api/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Lấy thông tin tài khoản hiện tại."""
    return {"status": "success", "user": user.model_dump()}

# ------------------------------------------------------------------------------
# REST API: Conversations Management (Lấy danh sách / Xem chi tiết / Xóa chat)
# ------------------------------------------------------------------------------
class CreateConversationRequest(BaseModel):
    zalo_uid: str | None = None
    title: str | None = None

@app.get("/api/conversations")
async def list_conversations(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
):
    """Lấy danh sách toàn bộ các đoạn chat của nhân viên (không phân biệt theo khách hàng)."""
    convs = await conversation_store.list_conversations(user=user, limit=limit, offset=offset)
    return {
        "status": "success",
        "conversations": [
            {
                "id": c.id,
                "title": c.metadata.get("title") or "Cuộc trò chuyện",
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in convs
        ],
    }

@app.post("/api/conversations")
async def create_conversation_endpoint(
    req: CreateConversationRequest,
    user: User = Depends(get_current_user),
):
    """Tạo đoạn chat mới cho khách hàng (zalo_uid)."""
    conv_id = str(uuid.uuid4())
    conv = await conversation_store.create_conversation(
        conversation_id=conv_id,
        user=user,
        initial_message="",
        zalo_uid=req.zalo_uid,
        title=req.title or "Cuộc trò chuyện mới",
    )
    return {
        "status": "success",
        "conversation": {
            "id": conv.id,
            "zalo_uid": req.zalo_uid,
            "title": conv.metadata.get("title") or "Cuộc trò chuyện mới",
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "messages": [],
        },
    }

class AddMessageRequest(BaseModel):
    role: str
    content: str
    metadata: dict | None = None

@app.post("/api/conversations/{conversation_id}/messages")
async def add_message_to_conversation(
    conversation_id: str,
    req: AddMessageRequest,
    user: User = Depends(get_current_user),
):
    """Lưu tin nhắn thủ công (như tin nhắn tạo đơn / thẻ đơn hàng) vào lịch sử chat."""
    conv = await conversation_store.get_conversation(conversation_id, user)
    if not conv:
        conv = await conversation_store.create_conversation(
            conversation_id=conversation_id,
            user=user,
            initial_message=req.content,
            title=req.content[:40] if req.content else "Tạo đơn hàng",
        )
    else:
        conv.add_message(Message(role=req.role, content=req.content, metadata=req.metadata or {}))
        await conversation_store.save_conversation(conv)
    return {"status": "success"}

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_history(
    conversation_id: str,
    user: User = Depends(get_current_user),
):
    """Lấy toàn bộ lịch sử tin nhắn của một đoạn chat (lọc bỏ tin rác/tool nội bộ)."""
    conv = await conversation_store.get_conversation(conversation_id, user)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    clean_messages = []
    for m in conv.messages:
        content = (m.content or "").strip()
        if not content:
            continue
        if m.role == "tool":
            continue
        if "Results saved to file:" in content or "IMPORTANT: FOR VISUALIZE_DATA" in content:
            continue
        if m.role in ("user", "assistant"):
            clean_messages.append({
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                "metadata": m.metadata,
            })

    return {
        "status": "success",
        "conversation": {
            "id": conv.id,
            "zalo_uid": conv.metadata.get("zalo_uid"),
            "title": conv.metadata.get("title") or "Cuộc trò chuyện",
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "messages": clean_messages,
        },
    }

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation_route(
    conversation_id: str,
    user: User = Depends(get_current_user),
):
    """Xóa một đoạn chat."""
    deleted = await conversation_store.delete_conversation(conversation_id, user)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or not authorized to delete",
        )
    return {"status": "success", "message": "Conversation deleted"}

if __name__ == "__main__":
    import uvicorn
    import uuid
    print("--------------------------------------------------")
    print("🚀 Khởi chạy Vanna AI Chatbot Web App!")
    print("👉 Mở trình duyệt truy cập: http://localhost:8000")
    print("📁 CSDL Lịch sử: chatbot.db (SQLite)")
    print("--------------------------------------------------")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


