"""
JWT User Resolver implementation for authenticating users via JSON Web Tokens.
"""

from __future__ import annotations

import base64
import hmac
import hashlib
import json
import time
from typing import Any, Dict, Optional

from .resolver import UserResolver
from .models import User
from .request_context import RequestContext

SECRET_KEY = "vanna_secure_jwt_secret_key_change_in_production"
ALGORITHM = "HS256"


def create_access_token(data: Dict[str, Any], expires_in_seconds: int = 86400 * 7) -> str:
    """Generate a signed JWT token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_in_seconds
    payload["iat"] = int(time.time())

    def b64_encode(d: Dict[str, Any]) -> str:
        s = json.dumps(d, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(s).decode("utf-8").rstrip("=")

    header_b64 = b64_encode(header)
    payload_b64 = b64_encode(payload)
    message = f"{header_b64}.{payload_b64}"

    signature = hmac.new(
        SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")

    return f"{message}.{sig_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify and decode a JWT token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, sig_b64 = parts
        message = f"{header_b64}.{payload_b64}"

        expected_sig = hmac.new(
            SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
        ).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode("utf-8").rstrip("=")

        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            return None

        # Pad base64 string
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += "=" * (4 - rem)

        payload_json = base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8")
        payload = json.loads(payload_json)

        # Check expiration
        if "exp" in payload and payload["exp"] < time.time():
            return None

        return payload
    except Exception:
        return None


class JwtUserResolver(UserResolver):
    """
    User resolver that extracts user identity from JWT tokens in headers/cookies.
    Falls back to a default user if no token is provided.
    """

    def __init__(self, fallback_user: Optional[User] = None):
        self.fallback_user = fallback_user or User(
            id="guest_user",
            email="guest@example.com",
            username="Guest",
            group_memberships=["user"],
        )

    async def resolve_user(self, request_context: RequestContext) -> User:
        """Extract and authenticate user from RequestContext."""
        if not request_context:
            return self.fallback_user

        token = None

        # 1. Check Authorization header: "Bearer <token>"
        auth_header = request_context.get_header("authorization") or request_context.get_header("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

        # 2. Check cookies
        if not token and request_context.cookies:
            token = request_context.cookies.get("access_token") or request_context.cookies.get("auth_token")

        # 3. Check query params
        if not token and request_context.query_params:
            token = request_context.query_params.get("token")

        if token:
            payload = decode_access_token(token)
            if payload and "sub" in payload:
                return User(
                    id=payload["sub"],
                    email=payload.get("email"),
                    username=payload.get("username", payload.get("email")),
                    group_memberships=payload.get("groups", ["user"]),
                )

        return self.fallback_user
