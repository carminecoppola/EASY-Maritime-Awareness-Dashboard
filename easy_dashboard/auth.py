# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Local authentication: users, roles, server-side sessions and an audit log.

Design notes:

- Three roles, ranked: viewer < operator < admin. A route declares the
  minimum role it needs; any role at or above that rank is allowed.
- Passwords are hashed with ``hashlib.scrypt`` (standard library, no extra
  dependency).
- Sessions are server-side (an opaque id in an HttpOnly cookie, looked up in an
  in-memory table) rather than a signed cookie carrying the identity: this makes
  an admin's "revoke this session" meaningful, because a signed cookie cannot be
  revoked before it expires.
- Enforcement is a two-key safety switch, not just "an admin exists": the Admin
  must also enable it (or ``EASY_DASHBOARD_ENABLE_AUTH=1`` must be set).
  Completing first-run setup never silently locks anyone out of a device that
  has no login UI reachable yet; see the ``before_request`` hook in ``app.py``.
- Storage is a single JSON file (users and settings) written atomically (temp
  file plus rename), plus an append-only JSONL audit log, following the same
  on-disk conventions as ``easy_dashboard/stores.py``.
- Sensitive actions additionally need *step-up* authentication: the password
  typed again within the last five minutes.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import utc_now_iso

LOGGER = logging.getLogger("easy-dashboard")

ROLES = ("viewer", "operator", "admin")
ROLE_RANK = {role: rank for rank, role in enumerate(ROLES)}

# scrypt cost: N=2^14, r=8, p=1, the "interactive" parameters recommended by
# RFC 7914. Adequate for a human login on the Raspberry Pi without adding a
# noticeable delay.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_MAXMEM = 64 * 1024 * 1024

SESSION_TTL_SECONDS = 12 * 60 * 60  # sliding 12 h window, renewed on every request
SESSION_COOKIE_NAME = "easy_session"

# Step-up window: how long a destructive action stays "unlocked" after the
# password was typed again. Deliberately short: it is not a second session.
STEP_UP_WINDOW_SECONDS = 5 * 60

MIN_PASSWORD_LENGTH = 8


def is_valid_role(role: str) -> bool:
    """True for ``viewer``, ``operator`` and ``admin``."""
    return role in ROLE_RANK


def role_at_least(role: Optional[str], minimum: str) -> bool:
    """True when ``role`` ranks at or above ``minimum`` (None and unknown roles never do)."""
    if role is None or role not in ROLE_RANK:
        return False
    return ROLE_RANK[role] >= ROLE_RANK[minimum]


def hash_password(password: str) -> str:
    """Hash a password with scrypt and a fresh random salt.

    Format: ``scrypt$N$r$p$<salt hex>$<hash hex>``, so the parameters can change
    over time without invalidating stored hashes.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
        maxmem=_SCRYPT_MAXMEM,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash in constant time; any malformed hash is simply invalid."""
    try:
        algo, n_s, r_s, p_s, salt_hex, hash_hex = stored.split("$")
        if algo != "scrypt":
            return False
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n_s),
            r=int(r_s),
            p=int(p_s),
            dklen=len(expected),
            maxmem=_SCRYPT_MAXMEM,
        )
        return hmac.compare_digest(derived, expected)
    except (ValueError, TypeError):
        # Malformed hash or unknown algorithm: never raise to the caller, just
        # report the password as invalid.
        return False


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Return a user record without its password hash."""
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "active": user["active"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }


class UserStoreError(Exception):
    """Application-level error (duplicate username, invalid role, ...)."""


class UserStore:
    """Local users and authentication settings, persisted on disk."""

    def __init__(self, path: Path) -> None:
        """Load the users file (missing means first-run setup)."""
        self.path = path
        self._lock = threading.Lock()
        self._users: List[Dict[str, Any]] = []
        self._settings: Dict[str, Any] = {"anonymous_viewer_enabled": False}
        self._load()

    def _load(self) -> None:
        """Read and strictly validate the users file.

        A damaged file raises ``UserStoreError`` instead of being mistaken for a
        first-run setup, which would let anyone create a new admin.
        """
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return
        except (OSError, ValueError) as exc:
            raise UserStoreError(f"Cannot read auth users file {self.path}; restore it from backup before restarting") from exc
        # A damaged database must never be mistaken for first-run setup.
        if not isinstance(data, dict) or not isinstance(data.get("users"), list) or not isinstance(data.get("settings"), dict):
            raise UserStoreError(f"Invalid auth users file: {self.path}")
        users = data["users"]
        ids, names = set(), set()
        for user in users:
            if (
                not isinstance(user, dict)
                or any(not isinstance(user.get(key), str) or not user[key].strip() for key in ("id", "username", "password_hash"))
                or not isinstance(user.get("role"), str)
                or not is_valid_role(user["role"])
                or not isinstance(user.get("active"), bool)
            ):
                raise UserStoreError(f"Invalid user record in {self.path}")
            name = user["username"].strip().lower()
            if user["id"] in ids or name in names:
                raise UserStoreError(f"Duplicate user record in {self.path}")
            ids.add(user["id"])
            names.add(name)
        if any(not isinstance(value, bool) for key, value in data["settings"].items() if key in ("auth_enforced", "anonymous_viewer_enabled")):
            raise UserStoreError(f"Invalid auth settings in {self.path}")
        self._users = users
        self._settings.update(data["settings"])

    def _save_locked(self) -> None:
        """Atomically write users and settings. The caller must hold the lock."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"users": self._users, "settings": self._settings}
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def _find_by_username_locked(self, username: str) -> Optional[Dict[str, Any]]:
        """Case-insensitive username lookup. The caller must hold the lock."""
        needle = username.strip().lower()
        for user in self._users:
            if user["username"].lower() == needle:
                return user
        return None

    def has_admin(self) -> bool:
        """True when at least one active admin exists (false means first-run setup)."""
        with self._lock:
            return any(u["role"] == "admin" and u["active"] for u in self._users)

    def anonymous_viewer_enabled(self) -> bool:
        """Whether unauthenticated visitors get read-only (viewer) access."""
        with self._lock:
            return bool(self._settings.get("anonymous_viewer_enabled", False))

    def set_anonymous_viewer_enabled(self, enabled: bool) -> None:
        """Persist the anonymous viewer setting."""
        with self._lock:
            self._settings["anonymous_viewer_enabled"] = bool(enabled)
            self._save_locked()

    def auth_enforced(self) -> bool:
        """Persisted preference: whether the Admin chose to enforce roles.

        The process can still force it on or off through an environment variable; see
        ``AuthContext.enforcing``.
        """
        with self._lock:
            return bool(self._settings.get("auth_enforced", False))

    def set_auth_enforced(self, enabled: bool) -> None:
        """Persist the enforcement preference."""
        with self._lock:
            self._settings["auth_enforced"] = bool(enabled)
            self._save_locked()

    def list_users(self) -> List[Dict[str, Any]]:
        """All users, without password hashes."""
        with self._lock:
            return [_public_user(u) for u in self._users]

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """A copy of one user record (including the hash, for internal use), or None."""
        with self._lock:
            for user in self._users:
                if user["id"] == user_id:
                    return dict(user)
            return None

    def verify_credentials(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Return the user when the username and password match an active account, else None."""
        with self._lock:
            user = self._find_by_username_locked(username)
            if not user or not user["active"]:
                return None
            if not verify_password(password, user["password_hash"]):
                return None
            return dict(user)

    def create_user(self, username: str, password: str, role: str) -> Dict[str, Any]:
        """Create a user (username unique case-insensitively, password at least 8 characters)."""
        username = username.strip()
        if not username:
            raise UserStoreError("Username is required")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise UserStoreError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        if not is_valid_role(role):
            raise UserStoreError(f"Unknown role: {role}")
        with self._lock:
            if self._find_by_username_locked(username):
                raise UserStoreError("Username already exists")
            now = utc_now_iso()
            user = {
                "id": secrets.token_hex(8),
                "username": username,
                "password_hash": hash_password(password),
                "role": role,
                "active": True,
                "created_at": now,
                "updated_at": now,
            }
            self._users.append(user)
            self._save_locked()
            return _public_user(user)

    def update_user(
        self,
        user_id: str,
        *,
        role: Optional[str] = None,
        active: Optional[bool] = None,
        new_password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Change a user's role, active flag or password.

        The last active admin can neither be deactivated nor demoted.
        """
        if role is not None and not is_valid_role(role):
            raise UserStoreError(f"Unknown role: {role}")
        if new_password is not None and len(new_password) < MIN_PASSWORD_LENGTH:
            raise UserStoreError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        with self._lock:
            user = next((u for u in self._users if u["id"] == user_id), None)
            if user is None:
                raise UserStoreError("User not found")
            if active is False and user["role"] == "admin":
                remaining_admins = sum(
                    1 for u in self._users if u["role"] == "admin" and u["active"] and u["id"] != user_id
                )
                if remaining_admins == 0:
                    raise UserStoreError("Cannot deactivate the last active admin")
            if role is not None and user["role"] == "admin" and role != "admin":
                remaining_admins = sum(
                    1 for u in self._users if u["role"] == "admin" and u["active"] and u["id"] != user_id
                )
                if remaining_admins == 0:
                    raise UserStoreError("Cannot demote the last active admin")
            if role is not None:
                user["role"] = role
            if active is not None:
                user["active"] = active
            if new_password is not None:
                user["password_hash"] = hash_password(new_password)
            user["updated_at"] = utc_now_iso()
            self._save_locked()
            return _public_user(user)


@dataclass
class AuthSession:
    """One logged-in session: ids, expiry and the step-up (elevation) deadline."""
    session_id: str
    user_id: str
    csrf_token: str
    created_at: float
    expires_at: float
    # Short window after the password was typed again, for destructive actions
    # (step-up authentication). 0 means never elevated, or expired.
    elevated_until: float = 0.0

    def elevated(self) -> bool:
        """True while the step-up window is open."""
        return self.elevated_until > time.time()


class SessionStore:
    """In-memory server-side sessions.

    Restarting the process invalidates every session. That is accepted
    behaviour (it forces a new login), not a bug.
    """

    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS) -> None:
        """``ttl_seconds`` is the sliding session lifetime."""
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._sessions: Dict[str, AuthSession] = {}

    def create(self, user_id: str) -> AuthSession:
        """Create a session with random session and CSRF tokens."""
        now = time.time()
        session = AuthSession(
            session_id=secrets.token_urlsafe(32),
            user_id=user_id,
            csrf_token=secrets.token_urlsafe(32),
            created_at=now,
            expires_at=now + self.ttl_seconds,
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Optional[AuthSession]:
        """Return a live session and extend its lifetime; expired sessions are removed and return None."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.expires_at < time.time():
                del self._sessions[session_id]
                return None
            # Sliding session: every valid request pushes the expiry forward.
            session.expires_at = time.time() + self.ttl_seconds
            return session

    def delete(self, session_id: str) -> None:
        """Remove one session (logout or revocation)."""
        with self._lock:
            self._sessions.pop(session_id, None)

    def delete_all_for_user(self, user_id: str) -> None:
        """Revoke every session of a user (e.g. after a password change)."""
        with self._lock:
            for sid in [sid for sid, s in self._sessions.items() if s.user_id == user_id]:
                del self._sessions[sid]

    def elevate(self, session_id: str, window_seconds: int = STEP_UP_WINDOW_SECONDS) -> Optional[AuthSession]:
        """Mark the session as "elevated" after the password was re-verified.

        Destructive actions stay unlocked for a short window, not for the whole
        session.
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or session.expires_at < time.time():
                return None
            session.elevated_until = time.time() + window_seconds
            return session


class LoginRateLimiter:
    """Exponential back-off after each failed login, per key.

    The key is typically the lower-case username. Counters are not persisted:
    restarting the service resets them, which is acceptable for a local device.
    """

    def __init__(self, max_delay_seconds: float = 30.0) -> None:
        """``max_delay_seconds`` caps the back-off (1, 2, 4, ... seconds)."""
        self.max_delay_seconds = max_delay_seconds
        self._lock = threading.Lock()
        self._failures: Dict[str, int] = {}
        self._locked_until: Dict[str, float] = {}

    def seconds_until_allowed(self, key: str) -> float:
        """Seconds the caller must still wait before another attempt (0 when allowed)."""
        with self._lock:
            locked_until = self._locked_until.get(key, 0.0)
            remaining = locked_until - time.time()
            return max(0.0, remaining)

    def record_failure(self, key: str) -> None:
        """Register a failed attempt and lock the key for 2^(failures-1) seconds."""
        with self._lock:
            failures = self._failures.get(key, 0) + 1
            self._failures[key] = failures
            delay = min(2 ** (failures - 1), self.max_delay_seconds)
            self._locked_until[key] = time.time() + delay

    def record_success(self, key: str) -> None:
        """Clear the failure counters after a successful login."""
        with self._lock:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)


class AuditLog:
    """Append-only audit log (JSONL), same pattern as ``EventStore``."""

    def __init__(self, path: Path, memory_limit: int = 500) -> None:
        """``path`` is the JSONL file; it is created on first write."""
        self.path = path
        self.memory_limit = memory_limit
        self._lock = threading.Lock()

    def add(
        self,
        *,
        actor: str,
        role: Optional[str],
        action: str,
        resource: Optional[str] = None,
        result: str = "success",
        client_ip: Optional[str] = None,
        detail: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Append one audit entry (who, what, on which resource, with which result, from which address)."""
        entry = {
            "timestamp": utc_now_iso(),
            "actor": actor,
            "role": role,
            "action": action,
            "resource": resource,
            "result": result,
            "client_ip": client_ip,
            "detail": detail,
        }
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return entry

    def list(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Return the most recent ``limit`` entries, newest first (malformed lines are skipped)."""
        if not self.path.exists():
            return []
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except OSError:
            LOGGER.exception("Failed to read audit log: %s", self.path)
            return []
        entries: List[Dict[str, Any]] = []
        for line in lines[-max(limit, 0) - 200 :]:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        entries.reverse()
        return entries[:limit]


# /api/auth/* endpoints reachable without an identity: they are the way to
# obtain one (login/setup) or to read the public state. Everything else under
# /api/auth/ (users, audit, settings) requires admin, like any other
# administrative path.
PUBLIC_AUTH_PATHS = {
    "/api/auth/status",
    "/api/auth/session",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/setup",
}

# Backend paths subject to authentication when enforcement is on. Everything
# else (SPA assets, /) stays public: it is what is needed to load the login
# page itself.
PROTECTED_PREFIXES = (
    "/api/",
    "/video/",
    "/thermal/",
    "/snapshot/",
    "/snapshots/",
    "/health",
    "/system",
    "/cameras",
    "/events",
)

# Admin-only actions: user and audit management (under /api/auth/), sensitive
# hardware configuration and service restart. The other field operations that
# change state (mission start/stop, capture, analysis, source selection) stay
# at Operator level.
ADMIN_ONLY_PREFIXES = (
    "/api/auth/users",
    "/api/auth/audit",
    "/api/auth/settings",
)
ADMIN_ONLY_EXACT = {
    "/api/system/restart",
}


def is_public_path(path: str) -> bool:
    """True when a path can be used without an identity (login/setup endpoints and the SPA assets)."""
    if path in PUBLIC_AUTH_PATHS:
        return True
    return not path.startswith(PROTECTED_PREFIXES)


def required_role_for(method: str, path: str) -> Optional[str]:
    """Minimum role for a protected path, or None when the path is public."""
    if is_public_path(path):
        return None
    if path in ADMIN_ONLY_EXACT or path.startswith(ADMIN_ONLY_PREFIXES):
        return "admin"
    if method in ("GET", "HEAD"):
        return "viewer"
    return "operator"


# Destructive or security-reducing actions: they need the password to have been
# typed again within STEP_UP_WINDOW_SECONDS, not only the right role.
#   - changing an existing user (role, deactivation, password reset):
#     PATCH/DELETE on /api/auth/users/<id>, never the POST that creates one;
#   - touching the security settings (turning enforcement off, opening
#     anonymous access): POST /api/auth/settings, always, even when a given
#     request only makes them stricter. One extra prompt is cheap; skipping it
#     on the wrong request is not;
#   - restarting the hardware services (POST /api/system/restart).
_ELEVATED_PREFIXES = ("/api/auth/users/",)
_ELEVATED_METHODS_FOR_PREFIX = {"PATCH", "DELETE"}
_ELEVATED_EXACT = {
    ("POST", "/api/auth/settings"),
    ("POST", "/api/system/restart"),
}


def requires_elevation(method: str, path: str) -> bool:
    """True for destructive or security-reducing requests that need step-up authentication."""
    if path.startswith(_ELEVATED_PREFIXES) and method in _ELEVATED_METHODS_FOR_PREFIX:
        return True
    return (method, path) in _ELEVATED_EXACT


@dataclass
class AuthContext:
    """Groups the authentication collaborators in one object.

    It is stored in ``app.config['easy_auth']``, the same pattern used for the
    dashboard runtime.
    """

    user_store: UserStore
    session_store: SessionStore = field(default_factory=SessionStore)
    audit_log: Optional[AuditLog] = None
    rate_limiter: LoginRateLimiter = field(default_factory=LoginRateLimiter)
    legacy_shared_token: str = ""
    # Three-state switch, read from EASY_DASHBOARD_ENABLE_AUTH:
    #   None  -> "auto": follows the persisted preference (UserStore.auth_enforced,
    #            set by the Admin in Users & Roles);
    #   True  -> forces enforcement on, ignoring the stored preference (useful
    #            for tests and automated deployments);
    #   False -> forces enforcement off ALWAYS, even when an Admin exists and
    #            enabled the preference. This is the emergency way back into a
    #            locked dashboard with no reachable login UI: SSH into the Pi,
    #            set the variable, restart the service.
    env_override: Optional[bool] = None

    def enforcing(self) -> bool:
        """True when roles are enforced.

        Never before the first admin exists; after that the environment override wins,
        otherwise the Admin's stored preference.
        """
        if not self.user_store.has_admin():
            return False
        if self.env_override is not None:
            return self.env_override
        return self.user_store.auth_enforced()
