"""Local authentication: users, roles, server-side sessions, audit log.

Design notes (see conversation for the full rationale):

- Three roles, ranked: viewer < operator < admin. A route declares the
  minimum role it needs; any role at or above that rank is allowed.
- Passwords are hashed with hashlib.scrypt (stdlib, no new dependency —
  requirements.txt has no pinned Python floor and the project otherwise
  avoids compiled dependencies where the stdlib suffices).
- Sessions are server-side (opaque id in an HttpOnly cookie, looked up in an
  in-memory table) rather than a signed cookie carrying the user's identity:
  this makes an admin's "revoke this session" meaningful — a signed cookie
  cannot be revoked before it expires.
- Enforcement is a two-key safety switch, not just "an admin exists":
  EASY_DASHBOARD_ENABLE_AUTH=1 must also be set. Completing first-run setup
  (creating the first Admin) never silently locks anyone out of a device
  that has no login UI reachable yet — see app.py's before_request hook.
- Storage is a single JSON file (users + settings) written atomically
  (temp file + os.replace), plus an append-only JSONL audit log, following
  the same on-disk conventions as easy_dashboard/stores.py.
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

# Costi scrypt: N=2^14, r=8, p=1 — i parametri "interactive" raccomandati da
# RFC 7914, adeguati a un login umano sul Raspberry Pi senza introdurre una
# latenza percepibile.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_MAXMEM = 64 * 1024 * 1024

SESSION_TTL_SECONDS = 12 * 60 * 60  # 12h scorrevoli, rinnovate ad ogni richiesta
SESSION_COOKIE_NAME = "easy_session"

# Finestra di step-up: quanto resta "sbloccata" un'azione distruttiva dopo
# aver ri-digitato la password. Breve apposta — non è una seconda sessione.
STEP_UP_WINDOW_SECONDS = 5 * 60

MIN_PASSWORD_LENGTH = 8


def is_valid_role(role: str) -> bool:
    return role in ROLE_RANK


def role_at_least(role: Optional[str], minimum: str) -> bool:
    if role is None or role not in ROLE_RANK:
        return False
    return ROLE_RANK[role] >= ROLE_RANK[minimum]


def hash_password(password: str) -> str:
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
        # Hash malformato o algoritmo sconosciuto: mai un'eccezione fino al
        # chiamante, solo "non valida".
        return False


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Rappresentazione di un utente senza l'hash della password."""
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "active": user["active"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }


class UserStoreError(Exception):
    """Errore applicativo (username duplicato, ruolo invalido, ecc.)."""


class UserStore:
    """Utenti locali e impostazioni di autenticazione, persistiti su disco."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._users: List[Dict[str, Any]] = []
        self._settings: Dict[str, Any] = {"anonymous_viewer_enabled": False}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            LOGGER.exception("Failed to read auth users file, starting empty: %s", self.path)
            return
        self._users = list(data.get("users") or [])
        self._settings.update(data.get("settings") or {})

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"users": self._users, "settings": self._settings}
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def _find_by_username_locked(self, username: str) -> Optional[Dict[str, Any]]:
        needle = username.strip().lower()
        for user in self._users:
            if user["username"].lower() == needle:
                return user
        return None

    def has_admin(self) -> bool:
        with self._lock:
            return any(u["role"] == "admin" and u["active"] for u in self._users)

    def anonymous_viewer_enabled(self) -> bool:
        with self._lock:
            return bool(self._settings.get("anonymous_viewer_enabled", False))

    def set_anonymous_viewer_enabled(self, enabled: bool) -> None:
        with self._lock:
            self._settings["anonymous_viewer_enabled"] = bool(enabled)
            self._save_locked()

    def auth_enforced(self) -> bool:
        """Preferenza persistita: se l'Admin ha scelto di far rispettare i
        ruoli. Il processo può comunque forzarla on/off tramite variabile
        d'ambiente — vedi AuthContext.enforcing()."""
        with self._lock:
            return bool(self._settings.get("auth_enforced", False))

    def set_auth_enforced(self, enabled: bool) -> None:
        with self._lock:
            self._settings["auth_enforced"] = bool(enabled)
            self._save_locked()

    def list_users(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [_public_user(u) for u in self._users]

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for user in self._users:
                if user["id"] == user_id:
                    return dict(user)
            return None

    def verify_credentials(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            user = self._find_by_username_locked(username)
            if not user or not user["active"]:
                return None
            if not verify_password(password, user["password_hash"]):
                return None
            return dict(user)

    def create_user(self, username: str, password: str, role: str) -> Dict[str, Any]:
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
    session_id: str
    user_id: str
    csrf_token: str
    created_at: float
    expires_at: float
    # Finestra breve dopo aver ri-digitato la password, per le azioni
    # distruttive (step-up auth) — 0 = mai elevata o scaduta.
    elevated_until: float = 0.0

    def elevated(self) -> bool:
        return self.elevated_until > time.time()


class SessionStore:
    """Sessioni server-side in memoria. Riavviare il processo invalida tutte
    le sessioni: comportamento accettato (forza un nuovo login), non un bug.
    """

    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS) -> None:
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._sessions: Dict[str, AuthSession] = {}

    def create(self, user_id: str) -> AuthSession:
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
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.expires_at < time.time():
                del self._sessions[session_id]
                return None
            # Sessione scorrevole: ogni richiesta valida allontana la scadenza.
            session.expires_at = time.time() + self.ttl_seconds
            return session

    def delete(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def delete_all_for_user(self, user_id: str) -> None:
        with self._lock:
            for sid in [sid for sid, s in self._sessions.items() if s.user_id == user_id]:
                del self._sessions[sid]

    def elevate(self, session_id: str, window_seconds: int = STEP_UP_WINDOW_SECONDS) -> Optional[AuthSession]:
        """Segna la sessione come "elevata" dopo aver ri-verificato la
        password: le azioni distruttive restano sbloccate per una finestra
        breve, non per l'intera durata della sessione."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or session.expires_at < time.time():
                return None
            session.elevated_until = time.time() + window_seconds
            return session


class LoginRateLimiter:
    """Backoff esponenziale per tentativo di login fallito, per chiave
    (tipicamente username in minuscolo). Non persistito: riavviare il
    servizio azzera i contatori, accettabile per un dispositivo locale.
    """

    def __init__(self, max_delay_seconds: float = 30.0) -> None:
        self.max_delay_seconds = max_delay_seconds
        self._lock = threading.Lock()
        self._failures: Dict[str, int] = {}
        self._locked_until: Dict[str, float] = {}

    def seconds_until_allowed(self, key: str) -> float:
        with self._lock:
            locked_until = self._locked_until.get(key, 0.0)
            remaining = locked_until - time.time()
            return max(0.0, remaining)

    def record_failure(self, key: str) -> None:
        with self._lock:
            failures = self._failures.get(key, 0) + 1
            self._failures[key] = failures
            delay = min(2 ** (failures - 1), self.max_delay_seconds)
            self._locked_until[key] = time.time() + delay

    def record_success(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)


class AuditLog:
    """Log di audit append-only (JSONL), stesso pattern di EventStore."""

    def __init__(self, path: Path, memory_limit: int = 500) -> None:
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


# Endpoint di /api/auth/* raggiungibili senza un'identità: sono il modo
# stesso per ottenerne una (login/setup) o per leggere lo stato pubblico.
# Tutto il resto sotto /api/auth/ (utenti, audit, impostazioni) richiede
# admin, come qualunque altro percorso amministrativo.
PUBLIC_AUTH_PATHS = {
    "/api/auth/status",
    "/api/auth/session",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/setup",
}

# Percorsi "di backend" soggetti ad autenticazione quando l'enforcement è
# attivo. Tutto il resto (asset della SPA, /paper-assets, /) resta pubblico:
# è cosa serve per caricare la pagina di login stessa.
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

# Azioni riservate all'Admin: gestione utenti/audit (sotto /api/auth/, già
# gestita da PUBLIC_AUTH_PATHS più sopra), configurazione hardware sensibile,
# riavvio del servizio. Le altre operazioni mutative "di campo" — start/stop
# missione, capture, analisi, selezione sorgente — restano a livello Operator.
ADMIN_ONLY_PREFIXES = (
    "/api/auth/users",
    "/api/auth/audit",
    "/api/auth/settings",
)
ADMIN_ONLY_EXACT = {
    "/api/system/restart",
}


def is_public_path(path: str) -> bool:
    if path in PUBLIC_AUTH_PATHS:
        return True
    return not path.startswith(PROTECTED_PREFIXES)


def required_role_for(method: str, path: str) -> Optional[str]:
    """Ruolo minimo per un percorso protetto, o None se il percorso è pubblico."""
    if is_public_path(path):
        return None
    if path in ADMIN_ONLY_EXACT or path.startswith(ADMIN_ONLY_PREFIXES):
        return "admin"
    if method in ("GET", "HEAD"):
        return "viewer"
    return "operator"


# Azioni distruttive o che riducono la sicurezza: richiedono aver ri-digitato
# la password entro STEP_UP_WINDOW_SECONDS, non solo il ruolo giusto.
#   - modificare un utente esistente (ruolo, disattivazione, reset password):
#     PATCH/DELETE su /api/auth/users/<id>, mai la POST che ne crea uno nuovo;
#   - toccare le impostazioni di sicurezza (disattivare l'enforcement,
#     aprire l'accesso anonimo — POST /api/auth/settings, sempre, anche se
#     un dato invio le sta solo rendendo più severe: il costo di un prompt
#     in più è basso, il costo di saltarlo su quello sbagliato non lo è);
#   - riavviare i servizi hardware (POST /api/system/restart).
_ELEVATED_PREFIXES = ("/api/auth/users/",)
_ELEVATED_METHODS_FOR_PREFIX = {"PATCH", "DELETE"}
_ELEVATED_EXACT = {
    ("POST", "/api/auth/settings"),
    ("POST", "/api/system/restart"),
}


def requires_elevation(method: str, path: str) -> bool:
    if path.startswith(_ELEVATED_PREFIXES) and method in _ELEVATED_METHODS_FOR_PREFIX:
        return True
    return (method, path) in _ELEVATED_EXACT


@dataclass
class AuthContext:
    """Raggruppa le collaborazioni dell'auth in un unico oggetto, tenuto in
    app.config['easy_auth'] — stesso pattern del dashboard_runtime.
    """

    user_store: UserStore
    session_store: SessionStore = field(default_factory=SessionStore)
    audit_log: Optional[AuditLog] = None
    rate_limiter: LoginRateLimiter = field(default_factory=LoginRateLimiter)
    legacy_shared_token: str = ""
    # Interruttore a tre stati, letto da EASY_DASHBOARD_ENABLE_AUTH:
    #   None  -> "auto", segue la preferenza persistita (UserStore.auth_enforced,
    #            impostabile dall'Admin in Users & Roles);
    #   True  -> forza l'enforcement acceso, ignorando la preferenza salvata
    #            (utile per test/deploy automatizzati);
    #   False -> forza l'enforcement spento SEMPRE, anche se un Admin esiste
    #            e ha attivato la preferenza — via utilizzabile in emergenza
    #            (SSH sul Pi, imposta la variabile, riavvia il servizio) per
    #            rientrare in un dashboard bloccato senza UI raggiungibile.
    env_override: Optional[bool] = None

    def enforcing(self) -> bool:
        if not self.user_store.has_admin():
            return False
        if self.env_override is not None:
            return self.env_override
        return self.user_store.auth_enforced()
