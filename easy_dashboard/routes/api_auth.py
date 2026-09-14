"""Login, first-run setup, session, user management and audit log.

Every mutating route here re-checks the role itself (not just the global
before_request hook in app.py): defense in depth, and it keeps this file
readable as the single source of truth for what each auth endpoint requires.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, current_app, g, jsonify, request

from easy_dashboard.auth import (
    STEP_UP_WINDOW_SECONDS,
    AuthContext,
    UserStoreError,
    role_at_least,
)
from easy_dashboard.routes import get_runtime

api_auth_bp = Blueprint("api_auth", __name__)


def get_auth() -> AuthContext:
    return current_app.config["easy_auth"]


def _client_ip() -> str:
    return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()


def _parse_json() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _set_session_cookie(response: Any, session_id: str) -> None:
    response.set_cookie(
        "easy_session",
        session_id,
        httponly=True,
        samesite="Lax",
        secure=request.is_secure,
        max_age=12 * 60 * 60,
        path="/",
    )


def _clear_session_cookie(response: Any) -> None:
    response.delete_cookie("easy_session", path="/")


@api_auth_bp.route("/api/auth/status", methods=["GET"])
def api_auth_status():
    auth = get_auth()
    # Hostname/modello sono le stesse informazioni non-sensibili già esposte
    # da GET /system — qui servono a mostrare "stai accedendo al device
    # giusto" nella schermata di login, PRIMA di qualunque autenticazione.
    try:
        probe = get_runtime().probe
        hostname = probe.hostname()
    except Exception:
        hostname = None
    return jsonify(
        {
            "ok": True,
            "setup_complete": auth.user_store.has_admin(),
            # Stato effettivo (tiene conto dell'override d'ambiente) — è
            # quello che decide se la UI deve richiedere il login.
            "enforcement_enabled": auth.enforcing(),
            # Preferenza salvata dall'Admin, distinta dallo stato effettivo:
            # permette alla UI di spiegare un eventuale disallineamento
            # (es. "attivo nelle impostazioni ma disattivato dal server").
            "auth_enforced_setting": auth.user_store.auth_enforced(),
            "enforcement_forced_by_server": auth.env_override,
            "anonymous_viewer_enabled": auth.user_store.anonymous_viewer_enabled(),
            "hostname": hostname,
        }
    )


@api_auth_bp.route("/api/auth/session", methods=["GET"])
def api_auth_session():
    user = getattr(g, "current_user", None)
    session = getattr(g, "current_session", None)
    if user is None:
        return jsonify({"ok": True, "user": None})
    return jsonify(
        {
            "ok": True,
            "user": user,
            "csrf_token": session.csrf_token if session is not None else None,
            # Un'identità legacy (X-EASY-Token) non ha una sessione con CSRF:
            # lo si segnala esplicitamente invece di lasciare che il client
            # deduca un errore da un campo assente.
            "legacy": session is None,
            "elevated": bool(session and session.elevated()),
            "elevated_until": session.elevated_until if session is not None else None,
        }
    )


@api_auth_bp.route("/api/auth/setup", methods=["POST"])
def api_auth_setup():
    auth = get_auth()
    if auth.user_store.has_admin():
        return jsonify({"ok": False, "error": "Setup has already been completed"}), 409

    payload = _parse_json()
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    allow_anonymous_viewer = bool(payload.get("allow_anonymous_viewer", False))

    if not username or not password:
        return jsonify({"ok": False, "error": "Username and password are required"}), 422

    try:
        user = auth.user_store.create_user(username, password, "admin")
    except UserStoreError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 422

    auth.user_store.set_anonymous_viewer_enabled(allow_anonymous_viewer)

    session = auth.session_store.create(user["id"])
    # Aver appena scelto la password conta come una ri-verifica: la prima
    # cosa che un Admin fa dopo il setup è spesso attivare l'enforcement da
    # Users & Roles, che non deve richiedere un secondo prompt immediato.
    auth.session_store.elevate(session.session_id)
    if auth.audit_log:
        auth.audit_log.add(
            actor=username,
            role="admin",
            action="auth.setup_completed",
            result="success",
            client_ip=_client_ip(),
        )

    response = jsonify({"ok": True, "user": user, "csrf_token": session.csrf_token, "elevated": True})
    _set_session_cookie(response, session.session_id)
    return response


@api_auth_bp.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    auth = get_auth()
    payload = _parse_json()
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    rate_key = username.lower() or "unknown"

    wait = auth.rate_limiter.seconds_until_allowed(rate_key)
    if wait > 0:
        return (
            jsonify({"ok": False, "error": "Too many attempts. Try again shortly.", "retry_after_seconds": round(wait, 1)}),
            429,
        )

    user = auth.user_store.verify_credentials(username, password) if username and password else None
    if user is None:
        auth.rate_limiter.record_failure(rate_key)
        if auth.audit_log:
            auth.audit_log.add(
                actor=username or "unknown",
                role=None,
                action="auth.login",
                result="failed",
                client_ip=_client_ip(),
            )
        return jsonify({"ok": False, "error": "Invalid username or password"}), 401

    auth.rate_limiter.record_success(rate_key)
    session = auth.session_store.create(user["id"])
    if auth.audit_log:
        auth.audit_log.add(
            actor=user["username"],
            role=user["role"],
            action="auth.login",
            result="success",
            client_ip=_client_ip(),
        )

    public_user = {k: v for k, v in user.items() if k != "password_hash"}
    response = jsonify({"ok": True, "user": public_user, "csrf_token": session.csrf_token})
    _set_session_cookie(response, session.session_id)
    return response


@api_auth_bp.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    auth = get_auth()
    session_id = request.cookies.get("easy_session")
    user = getattr(g, "current_user", None)
    if session_id:
        auth.session_store.delete(session_id)
    if auth.audit_log and user is not None:
        auth.audit_log.add(
            actor=user["username"],
            role=user["role"],
            action="auth.logout",
            result="success",
            client_ip=_client_ip(),
        )
    response = jsonify({"ok": True})
    _clear_session_cookie(response)
    return response


def _require_role(minimum: str) -> Any:
    """Restituisce una risposta di errore se il ruolo corrente è insufficiente, altrimenti None."""
    user = getattr(g, "current_user", None)
    role = user["role"] if user else None
    if not role_at_least(role, minimum):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": f"Requires role '{minimum}' or higher",
                    "your_role": role,
                }
            ),
            403,
        )
    return None


def _require_elevation() -> Any:
    """Come _require_role, ma per lo step-up: la richiesta deve arrivare da
    una sessione (non da un token legacy o da un accesso anonimo — nessuno
    dei due ha una password da ri-verificare) elevata di recente."""
    session = getattr(g, "current_session", None)
    if session is None or not session.elevated():
        return (
            jsonify(
                {
                    "ok": False,
                    "code": "step_up_required",
                    "error": "Re-enter your password to confirm this action",
                    "step_up_window_seconds": STEP_UP_WINDOW_SECONDS,
                }
            ),
            403,
        )
    return None


@api_auth_bp.route("/api/auth/step-up", methods=["POST"])
def api_auth_step_up():
    auth = get_auth()
    user = getattr(g, "current_user", None)
    session = getattr(g, "current_session", None)
    if user is None or session is None:
        # Un token legacy o un Viewer anonimo non hanno una password propria
        # da ri-digitare: lo step-up richiede di essere già collegati con un
        # vero account.
        return jsonify({"ok": False, "error": "Sign in with an account before confirming a sensitive action"}), 401

    payload = _parse_json()
    password = str(payload.get("password") or "")
    rate_key = f"stepup:{user['username'].lower()}"

    wait = auth.rate_limiter.seconds_until_allowed(rate_key)
    if wait > 0:
        return (
            jsonify({"ok": False, "error": "Too many attempts. Try again shortly.", "retry_after_seconds": round(wait, 1)}),
            429,
        )

    verified = auth.user_store.verify_credentials(user["username"], password) if password else None
    if verified is None:
        auth.rate_limiter.record_failure(rate_key)
        if auth.audit_log:
            auth.audit_log.add(
                actor=user["username"],
                role=user["role"],
                action="auth.step_up",
                result="failed",
                client_ip=_client_ip(),
            )
        return jsonify({"ok": False, "error": "Incorrect password"}), 401

    auth.rate_limiter.record_success(rate_key)
    elevated = auth.session_store.elevate(session.session_id)
    if auth.audit_log:
        auth.audit_log.add(
            actor=user["username"],
            role=user["role"],
            action="auth.step_up",
            result="success",
            client_ip=_client_ip(),
        )
    return jsonify({"ok": True, "elevated_until": elevated.elevated_until if elevated else None})


@api_auth_bp.route("/api/auth/users", methods=["GET"])
def api_auth_list_users():
    denied = _require_role("admin")
    if denied:
        return denied
    return jsonify({"ok": True, "users": get_auth().user_store.list_users()})


@api_auth_bp.route("/api/auth/users", methods=["POST"])
def api_auth_create_user():
    denied = _require_role("admin")
    if denied:
        return denied
    auth = get_auth()
    payload = _parse_json()
    username = str(payload.get("username") or "")
    password = str(payload.get("password") or "")
    role = str(payload.get("role") or "viewer")
    try:
        user = auth.user_store.create_user(username, password, role)
    except UserStoreError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 422
    actor = g.current_user["username"]
    if auth.audit_log:
        auth.audit_log.add(
            actor=actor,
            role="admin",
            action="user.created",
            resource=user["username"],
            result="success",
            client_ip=_client_ip(),
            detail=f"role={role}",
        )
    return jsonify({"ok": True, "user": user}), 201


@api_auth_bp.route("/api/auth/users/<user_id>", methods=["PATCH"])
def api_auth_update_user(user_id: str):
    denied = _require_role("admin")
    if denied:
        return denied
    denied = _require_elevation()
    if denied:
        return denied
    auth = get_auth()
    payload = _parse_json()
    role = payload.get("role")
    active = payload.get("active")
    new_password = payload.get("new_password")
    try:
        user = auth.user_store.update_user(
            user_id,
            role=str(role) if role is not None else None,
            active=bool(active) if active is not None else None,
            new_password=str(new_password) if new_password else None,
        )
    except UserStoreError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 422
    if active is False:
        auth.session_store.delete_all_for_user(user_id)
    actor = g.current_user["username"]
    if auth.audit_log:
        change = ", ".join(
            f"{k}={v}" for k, v in (("role", role), ("active", active), ("password", "reset" if new_password else None)) if v is not None
        )
        auth.audit_log.add(
            actor=actor,
            role="admin",
            action="user.updated",
            resource=user["username"],
            result="success",
            client_ip=_client_ip(),
            detail=change or None,
        )
    return jsonify({"ok": True, "user": user})


@api_auth_bp.route("/api/auth/users/<user_id>", methods=["DELETE"])
def api_auth_deactivate_user(user_id: str):
    """Alias di comodo per PATCH {active: false} — non esiste una cancellazione
    definitiva: la spec chiede disattivazione, non rimozione dei record."""
    denied = _require_role("admin")
    if denied:
        return denied
    denied = _require_elevation()
    if denied:
        return denied
    auth = get_auth()
    try:
        user = auth.user_store.update_user(user_id, active=False)
    except UserStoreError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 422
    auth.session_store.delete_all_for_user(user_id)
    if auth.audit_log:
        auth.audit_log.add(
            actor=g.current_user["username"],
            role="admin",
            action="user.deactivated",
            resource=user["username"],
            result="success",
            client_ip=_client_ip(),
        )
    return jsonify({"ok": True, "user": user})


@api_auth_bp.route("/api/auth/settings", methods=["POST"])
def api_auth_update_settings():
    denied = _require_role("admin")
    if denied:
        return denied
    denied = _require_elevation()
    if denied:
        return denied
    auth = get_auth()
    payload = _parse_json()
    changes = []

    if "anonymous_viewer_enabled" in payload:
        value = bool(payload["anonymous_viewer_enabled"])
        auth.user_store.set_anonymous_viewer_enabled(value)
        changes.append(f"anonymous_viewer_enabled={value}")

    if "auth_enforced" in payload:
        if auth.env_override is not None:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Enforcement is forced by the server environment and cannot be changed here",
                    }
                ),
                409,
            )
        value = bool(payload["auth_enforced"])
        auth.user_store.set_auth_enforced(value)
        changes.append(f"auth_enforced={value}")

    if changes and auth.audit_log:
        auth.audit_log.add(
            actor=g.current_user["username"],
            role="admin",
            action="settings.updated",
            result="success",
            client_ip=_client_ip(),
            detail=", ".join(changes),
        )

    return jsonify(
        {
            "ok": True,
            "anonymous_viewer_enabled": auth.user_store.anonymous_viewer_enabled(),
            "auth_enforced_setting": auth.user_store.auth_enforced(),
            "enforcement_enabled": auth.enforcing(),
        }
    )


@api_auth_bp.route("/api/auth/audit", methods=["GET"])
def api_auth_audit():
    denied = _require_role("admin")
    if denied:
        return denied
    auth = get_auth()
    limit = request.args.get("limit", default=100, type=int) or 100
    entries = auth.audit_log.list(limit) if auth.audit_log else []
    return jsonify({"ok": True, "entries": entries, "count": len(entries)})
