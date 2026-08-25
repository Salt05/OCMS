"""
SQLite / SQL database conversation store and user persistence implementation.

Provides persistent storage for conversations, messages, and users in an SQLite/SQL database.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import hashlib
import os
import hmac
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from vanna.core.storage import ConversationStore, Conversation, Message
from vanna.core.user.models import User
from vanna.core.tool.models import ToolCall


class SqlConversationStore(ConversationStore):
    """
    Persistent SQLite conversation store.
    Stores users, conversations, and individual messages.
    """

    def __init__(self, db_path: str = "chatbot.db") -> None:
        """
        Initialize the SQLite conversation store.

        Args:
            db_path: Path to the SQLite database file.
        """
        self.db_path = db_path
        self._lock = asyncio.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create necessary database tables if they do not exist."""
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        email TEXT UNIQUE,
                        username TEXT,
                        password_hash TEXT,
                        metadata TEXT,
                        created_at TEXT
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS conversations (
                        id TEXT PRIMARY KEY,
                        user_id TEXT,
                        zalo_uid TEXT,
                        title TEXT,
                        metadata TEXT,
                        created_at TEXT,
                        updated_at TEXT,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id TEXT,
                        zalo_uid TEXT,
                        role TEXT,
                        content TEXT,
                        metadata TEXT,
                        tool_calls TEXT,
                        tool_call_id TEXT,
                        timestamp TEXT,
                        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                    )
                """)
                # Migrations for existing database:
                try:
                    conn.execute("ALTER TABLE conversations ADD COLUMN zalo_uid TEXT")
                except Exception:
                    pass
                try:
                    conn.execute("ALTER TABLE messages ADD COLUMN zalo_uid TEXT")
                except Exception:
                    pass

                conn.execute("CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_conv_zalo ON conversations(zalo_uid)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_zalo ON messages(zalo_uid)")
        finally:
            conn.close()

    # --------------------------------------------------------------------------
    # User Management Helpers
    # --------------------------------------------------------------------------
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using PBKDF2 with SHA-256."""
        salt = os.urandom(16)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
        return f"{salt.hex()}:{key.hex()}"

    @staticmethod
    def verify_password(password: str, stored_hash: str) -> bool:
        """Verify a password against stored PBKDF2 hash."""
        try:
            salt_hex, key_hex = stored_hash.split(":")
            salt = bytes.fromhex(salt_hex)
            expected_key = bytes.fromhex(key_hex)
            key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
            return hmac.compare_digest(key, expected_key)
        except Exception:
            return False

    async def create_user(
        self, user_id: str, email: str, password: str, username: Optional[str] = None
    ) -> User:
        """Create and persist a new user in database."""
        async with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    pwd_hash = self.hash_password(password)
                    now = datetime.utcnow().isoformat()
                    conn.execute(
                        """
                        INSERT INTO users (id, email, username, password_hash, metadata, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (user_id, email, username or email, pwd_hash, json.dumps({}), now),
                    )
                return User(id=user_id, email=email, username=username or email, group_memberships=["user"])
            finally:
                conn.close()

    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate user by email and password."""
        async with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute("SELECT * FROM users WHERE email = ?", (email,))
                row = cur.fetchone()
                if not row:
                    return None
                if self.verify_password(password, row["password_hash"]):
                    metadata = json.loads(row["metadata"] or "{}")
                    return User(
                        id=row["id"],
                        email=row["email"],
                        username=row["username"],
                        metadata=metadata,
                        group_memberships=["user", "admin"] if row["email"].startswith("admin") else ["user"],
                    )
                return None
            finally:
                conn.close()

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Retrieve user by ID."""
        async with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                row = cur.fetchone()
                if not row:
                    return None
                metadata = json.loads(row["metadata"] or "{}")
                return User(
                    id=row["id"],
                    email=row["email"],
                    username=row["username"],
                    metadata=metadata,
                    group_memberships=["user", "admin"] if (row["email"] or "").startswith("admin") else ["user"],
                )
            finally:
                conn.close()

    # --------------------------------------------------------------------------
    # ConversationStore Interface Implementation
    # --------------------------------------------------------------------------
    async def create_conversation(
        self, conversation_id: str, user: User, initial_message: Optional[str] = None, zalo_uid: Optional[str] = None, title: Optional[str] = None
    ) -> Conversation:
        """Create a new conversation."""
        async with self._lock:
            conn = self._get_connection()
            try:
                now_dt = datetime.utcnow()
                now = now_dt.isoformat()
                conv_title = title or (initial_message[:60].strip() if initial_message else "Cuộc trò chuyện mới")

                metadata: Dict[str, Any] = {"title": conv_title}
                if zalo_uid:
                    metadata["zalo_uid"] = zalo_uid

                with conn:
                    # Insert conversation header
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO conversations (id, user_id, zalo_uid, title, metadata, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (conversation_id, user.id, zalo_uid, conv_title, json.dumps(metadata), now, now),
                    )

                    # Insert initial message if provided
                    if initial_message:
                        conn.execute(
                            """
                            INSERT INTO messages (conversation_id, zalo_uid, role, content, metadata, tool_calls, tool_call_id, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (conversation_id, zalo_uid, "user", initial_message, json.dumps({}), None, None, now),
                        )

                msg = Message(role="user", content=initial_message, timestamp=now_dt) if initial_message else None
                return Conversation(
                    id=conversation_id,
                    user=user,
                    messages=[msg] if msg else [],
                    created_at=now_dt,
                    updated_at=now_dt,
                    metadata=metadata,
                )
            finally:
                conn.close()

    async def get_conversation(
        self, conversation_id: str, user: User
    ) -> Optional[Conversation]:
        """Get a conversation by ID, scoped to user."""
        async with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute(
                    "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
                    (conversation_id, user.id),
                )
                conv_row = cur.fetchone()
                if not conv_row:
                    return None

                # Get all messages
                msg_cur = conn.execute(
                    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
                    (conversation_id,),
                )
                msg_rows = msg_cur.fetchall()

                messages: List[Message] = []
                for row in msg_rows:
                    tool_calls = None
                    if row["tool_calls"]:
                        try:
                            tc_raw = json.loads(row["tool_calls"])
                            tool_calls = [ToolCall(**tc) for tc in tc_raw]
                        except Exception:
                            tool_calls = None

                    try:
                        ts = datetime.fromisoformat(row["timestamp"])
                    except Exception:
                        ts = datetime.utcnow()

                    messages.append(
                        Message(
                            role=row["role"],
                            content=row["content"] or "",
                            timestamp=ts,
                            metadata=json.loads(row["metadata"] or "{}"),
                            tool_calls=tool_calls,
                            tool_call_id=row["tool_call_id"],
                        )
                    )

                created_at = datetime.fromisoformat(conv_row["created_at"]) if conv_row["created_at"] else datetime.utcnow()
                updated_at = datetime.fromisoformat(conv_row["updated_at"]) if conv_row["updated_at"] else datetime.utcnow()
                conv_metadata = json.loads(conv_row["metadata"] or "{}")
                if "title" not in conv_metadata and conv_row["title"]:
                    conv_metadata["title"] = conv_row["title"]
                if conv_row["zalo_uid"] and "zalo_uid" not in conv_metadata:
                    conv_metadata["zalo_uid"] = conv_row["zalo_uid"]

                return Conversation(
                    id=conv_row["id"],
                    user=user,
                    messages=messages,
                    created_at=created_at,
                    updated_at=updated_at,
                    metadata=conv_metadata,
                )
            finally:
                conn.close()

    async def update_conversation(self, conversation: Conversation) -> None:
        """Update conversation and sync its messages to SQLite."""
        async with self._lock:
            conn = self._get_connection()
            try:
                now_str = conversation.updated_at.isoformat() if conversation.updated_at else datetime.utcnow().isoformat()
                title = conversation.metadata.get("title")
                zalo_uid = conversation.metadata.get("zalo_uid")

                if not title and conversation.messages:
                    first_user_msg = next((m.content for m in conversation.messages if m.role == "user"), None)
                    if first_user_msg:
                        title = first_user_msg[:60].strip()

                with conn:
                    # Update conversation record
                    conn.execute(
                        """
                        INSERT INTO conversations (id, user_id, zalo_uid, title, metadata, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            zalo_uid=COALESCE(excluded.zalo_uid, conversations.zalo_uid),
                            title=excluded.title,
                            metadata=excluded.metadata,
                            updated_at=excluded.updated_at
                        """,
                        (
                            conversation.id,
                            conversation.user.id,
                            zalo_uid,
                            title or "Conversation",
                            json.dumps(conversation.metadata),
                            conversation.created_at.isoformat(),
                            now_str,
                        ),
                    )

                    # Delete existing messages and re-insert to keep sync
                    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation.id,))

                    for msg in conversation.messages:
                        tc_json = None
                        if msg.tool_calls:
                            tc_json = json.dumps([tc.model_dump() for tc in msg.tool_calls])

                        conn.execute(
                            """
                            INSERT INTO messages (conversation_id, zalo_uid, role, content, metadata, tool_calls, tool_call_id, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                conversation.id,
                                zalo_uid,
                                msg.role,
                                msg.content,
                                json.dumps(msg.metadata),
                                tc_json,
                                msg.tool_call_id,
                                msg.timestamp.isoformat() if msg.timestamp else now_str,
                            ),
                        )
            finally:
                conn.close()

    async def delete_conversation(self, conversation_id: str, user: User) -> bool:
        """Delete a conversation."""
        async with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cur = conn.execute(
                        "DELETE FROM conversations WHERE id = ? AND user_id = ?",
                        (conversation_id, user.id),
                    )
                    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
                    return cur.rowcount > 0
            finally:
                conn.close()

    async def list_conversations(
        self, user: User, limit: int = 50, offset: int = 0, zalo_uid: Optional[str] = None
    ) -> List[Conversation]:
        """List all conversations for a user, optionally filtered by zalo_uid."""
        async with self._lock:
            conn = self._get_connection()
            try:
                if zalo_uid:
                    cur = conn.execute(
                        """
                        SELECT id, user_id, zalo_uid, title, metadata, created_at, updated_at
                        FROM conversations
                        WHERE user_id = ? AND (zalo_uid = ? OR metadata LIKE ?)
                        ORDER BY updated_at DESC
                        LIMIT ? OFFSET ?
                        """,
                        (user.id, zalo_uid, f'%"{zalo_uid}"%', limit, offset),
                    )
                else:
                    cur = conn.execute(
                        """
                        SELECT id, user_id, zalo_uid, title, metadata, created_at, updated_at
                        FROM conversations
                        WHERE user_id = ?
                        ORDER BY updated_at DESC
                        LIMIT ? OFFSET ?
                        """,
                        (user.id, limit, offset),
                    )
                rows = cur.fetchall()

                result: List[Conversation] = []
                for r in rows:
                    c_meta = json.loads(r["metadata"] or "{}")
                    c_meta["title"] = r["title"] or "Conversation"
                    if r["zalo_uid"]:
                        c_meta["zalo_uid"] = r["zalo_uid"]

                    result.append(
                        Conversation(
                            id=r["id"],
                            user=user,
                            messages=[],  # lightweight listing without messages
                            created_at=datetime.fromisoformat(r["created_at"]) if r["created_at"] else datetime.utcnow(),
                            updated_at=datetime.fromisoformat(r["updated_at"]) if r["updated_at"] else datetime.utcnow(),
                            metadata=c_meta,
                        )
                    )
                return result
            finally:
                conn.close()
