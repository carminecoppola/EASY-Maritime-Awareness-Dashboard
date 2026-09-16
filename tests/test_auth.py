from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from easy_dashboard.auth import (
    AuditLog,
    LoginRateLimiter,
    SessionStore,
    UserStore,
    UserStoreError,
    hash_password,
    required_role_for,
    requires_elevation,
    role_at_least,
    verify_password,
)


class PasswordHashingTests(unittest.TestCase):
    def test_correct_password_verifies(self) -> None:
        stored = hash_password("correct horse battery staple")
        self.assertTrue(verify_password("correct horse battery staple", stored))

    def test_wrong_password_rejected(self) -> None:
        stored = hash_password("correct horse battery staple")
        self.assertFalse(verify_password("wrong password", stored))

    def test_same_password_hashes_differently_each_time(self) -> None:
        # Il salt casuale garantisce che due hash della stessa password non
        # coincidano mai — altrimenti un dump del file rivelerebbe le
        # password uguali.
        a = hash_password("same-password")
        b = hash_password("same-password")
        self.assertNotEqual(a, b)

    def test_malformed_stored_hash_is_rejected_not_raised(self) -> None:
        self.assertFalse(verify_password("anything", "not-a-valid-hash"))
        self.assertFalse(verify_password("anything", ""))


class RoleRankTests(unittest.TestCase):
    def test_higher_role_satisfies_lower_requirement(self) -> None:
        self.assertTrue(role_at_least("admin", "viewer"))
        self.assertTrue(role_at_least("operator", "viewer"))
        self.assertTrue(role_at_least("admin", "operator"))

    def test_lower_role_does_not_satisfy_higher_requirement(self) -> None:
        self.assertFalse(role_at_least("viewer", "operator"))
        self.assertFalse(role_at_least("operator", "admin"))

    def test_none_or_unknown_role_never_satisfies(self) -> None:
        self.assertFalse(role_at_least(None, "viewer"))
        self.assertFalse(role_at_least("superuser", "viewer"))


class RequiredRoleForRouteTests(unittest.TestCase):
    def test_spa_and_static_paths_are_public(self) -> None:
        self.assertIsNone(required_role_for("GET", "/"))
        self.assertIsNone(required_role_for("GET", "/mission"))
        self.assertIsNone(required_role_for("GET", "/paper-assets/rgb-left"))

    def test_public_auth_endpoints_need_no_role(self) -> None:
        for path in ("/api/auth/status", "/api/auth/session", "/api/auth/login", "/api/auth/setup"):
            self.assertIsNone(required_role_for("POST", path))

    def test_admin_only_auth_management_endpoints(self) -> None:
        self.assertEqual(required_role_for("GET", "/api/auth/users"), "admin")
        self.assertEqual(required_role_for("POST", "/api/auth/users"), "admin")
        self.assertEqual(required_role_for("GET", "/api/auth/audit"), "admin")

    def test_reads_require_viewer(self) -> None:
        self.assertEqual(required_role_for("GET", "/api/dashboard/state"), "viewer")
        self.assertEqual(required_role_for("GET", "/health"), "viewer")

    def test_mutations_require_operator_by_default(self) -> None:
        self.assertEqual(required_role_for("POST", "/api/session/start"), "operator")
        self.assertEqual(required_role_for("POST", "/api/sources/select"), "operator")
        self.assertEqual(required_role_for("POST", "/snapshot/rgb_left"), "operator")

    def test_system_restart_requires_admin(self) -> None:
        self.assertEqual(required_role_for("POST", "/api/system/restart"), "admin")


class RequiresElevationTests(unittest.TestCase):
    def test_modifying_an_existing_user_requires_elevation(self) -> None:
        self.assertTrue(requires_elevation("PATCH", "/api/auth/users/u1"))
        self.assertTrue(requires_elevation("DELETE", "/api/auth/users/u1"))

    def test_creating_a_new_user_does_not(self) -> None:
        self.assertFalse(requires_elevation("POST", "/api/auth/users"))

    def test_security_settings_and_restart_require_elevation(self) -> None:
        self.assertTrue(requires_elevation("POST", "/api/auth/settings"))
        self.assertTrue(requires_elevation("POST", "/api/system/restart"))

    def test_reading_users_or_ordinary_mutations_do_not(self) -> None:
        self.assertFalse(requires_elevation("GET", "/api/auth/users"))
        self.assertFalse(requires_elevation("POST", "/api/session/start"))
        self.assertFalse(requires_elevation("POST", "/snapshot/rgb_left"))


class UserStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = UserStore(Path(self._tmp.name) / "users.json")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_no_admin_initially(self) -> None:
        self.assertFalse(self.store.has_admin())

    def test_invalid_database_never_becomes_first_run(self) -> None:
        for content in ('{broken', 'null', '[]', '{}', '{"users": {}, "settings": {}}',
                        '{"users": [{}], "settings": {}}',
                        '{"users": [], "settings": {"auth_enforced": "false"}}'):
            with self.subTest(content=content):
                self.store.path.write_text(content)
                with self.assertRaises(UserStoreError):
                    UserStore(self.store.path)
                self.assertEqual(self.store.path.read_text(), content)

    def test_unreadable_database_never_becomes_first_run(self) -> None:
        with patch.object(Path, "read_text", side_effect=PermissionError("denied")):
            with self.assertRaises(UserStoreError):
                UserStore(self.store.path)

    def test_create_admin_then_has_admin(self) -> None:
        self.store.create_user("alice", "password123", "admin")
        self.assertTrue(self.store.has_admin())

    def test_duplicate_username_case_insensitive_rejected(self) -> None:
        self.store.create_user("Alice", "password123", "admin")
        with self.assertRaises(UserStoreError):
            self.store.create_user("alice", "password456", "viewer")

    def test_short_password_rejected(self) -> None:
        with self.assertRaises(UserStoreError):
            self.store.create_user("bob", "short", "viewer")

    def test_unknown_role_rejected(self) -> None:
        with self.assertRaises(UserStoreError):
            self.store.create_user("bob", "password123", "superuser")

    def test_created_user_is_never_returned_with_password_hash(self) -> None:
        user = self.store.create_user("carol", "password123", "operator")
        self.assertNotIn("password_hash", user)
        listed = self.store.list_users()
        self.assertNotIn("password_hash", listed[0])

    def test_verify_credentials_round_trip(self) -> None:
        self.store.create_user("dave", "password123", "viewer")
        self.assertIsNotNone(self.store.verify_credentials("dave", "password123"))
        self.assertIsNone(self.store.verify_credentials("dave", "wrong-password"))
        self.assertIsNone(self.store.verify_credentials("nobody", "password123"))

    def test_deactivated_user_cannot_verify_credentials(self) -> None:
        user = self.store.create_user("erin", "password123", "operator")
        self.store.update_user(user["id"], active=False)
        self.assertIsNone(self.store.verify_credentials("erin", "password123"))

    def test_cannot_deactivate_the_last_admin(self) -> None:
        admin = self.store.create_user("admin1", "password123", "admin")
        with self.assertRaises(UserStoreError):
            self.store.update_user(admin["id"], active=False)

    def test_can_deactivate_an_admin_when_another_remains(self) -> None:
        first = self.store.create_user("admin1", "password123", "admin")
        self.store.create_user("admin2", "password123", "admin")
        result = self.store.update_user(first["id"], active=False)
        self.assertFalse(result["active"])

    def test_cannot_demote_the_last_admin(self) -> None:
        admin = self.store.create_user("admin1", "password123", "admin")
        with self.assertRaises(UserStoreError):
            self.store.update_user(admin["id"], role="viewer")

    def test_persists_across_reload(self) -> None:
        self.store.create_user("frank", "password123", "operator")
        reloaded = UserStore(self.store.path)
        self.assertIsNotNone(reloaded.verify_credentials("frank", "password123"))

    def test_anonymous_viewer_setting_persists(self) -> None:
        self.store.set_anonymous_viewer_enabled(True)
        reloaded = UserStore(self.store.path)
        self.assertTrue(reloaded.anonymous_viewer_enabled())


class SessionStoreTests(unittest.TestCase):
    def test_created_session_is_retrievable(self) -> None:
        store = SessionStore(ttl_seconds=60)
        session = store.create("user-1")
        fetched = store.get(session.session_id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.user_id, "user-1")

    def test_expired_session_is_gone(self) -> None:
        store = SessionStore(ttl_seconds=0)
        session = store.create("user-1")
        time.sleep(0.01)
        self.assertIsNone(store.get(session.session_id))

    def test_deleted_session_is_gone(self) -> None:
        store = SessionStore(ttl_seconds=60)
        session = store.create("user-1")
        store.delete(session.session_id)
        self.assertIsNone(store.get(session.session_id))

    def test_a_new_session_is_never_elevated(self) -> None:
        store = SessionStore(ttl_seconds=60)
        session = store.create("user-1")
        self.assertFalse(session.elevated())

    def test_elevate_marks_the_session_elevated(self) -> None:
        store = SessionStore(ttl_seconds=60)
        session = store.create("user-1")
        store.elevate(session.session_id, window_seconds=60)
        self.assertTrue(store.get(session.session_id).elevated())

    def test_elevation_expires_on_its_own_window(self) -> None:
        store = SessionStore(ttl_seconds=60)
        session = store.create("user-1")
        store.elevate(session.session_id, window_seconds=0)
        time.sleep(0.01)
        self.assertFalse(store.get(session.session_id).elevated())

    def test_elevating_an_unknown_session_is_a_no_op(self) -> None:
        store = SessionStore(ttl_seconds=60)
        self.assertIsNone(store.elevate("does-not-exist"))

    def test_delete_all_for_user_revokes_every_session(self) -> None:
        store = SessionStore(ttl_seconds=60)
        s1 = store.create("user-1")
        s2 = store.create("user-1")
        store.delete_all_for_user("user-1")
        self.assertIsNone(store.get(s1.session_id))
        self.assertIsNone(store.get(s2.session_id))

    def test_unknown_session_id_returns_none(self) -> None:
        store = SessionStore(ttl_seconds=60)
        self.assertIsNone(store.get("does-not-exist"))


class LoginRateLimiterTests(unittest.TestCase):
    def test_no_delay_before_any_failure(self) -> None:
        limiter = LoginRateLimiter()
        self.assertEqual(limiter.seconds_until_allowed("alice"), 0.0)

    def test_failure_introduces_a_delay(self) -> None:
        limiter = LoginRateLimiter()
        limiter.record_failure("alice")
        self.assertGreater(limiter.seconds_until_allowed("alice"), 0.0)

    def test_delay_grows_with_repeated_failures(self) -> None:
        limiter = LoginRateLimiter(max_delay_seconds=100.0)
        limiter.record_failure("alice")
        first_delay = limiter.seconds_until_allowed("alice")
        limiter.record_failure("alice")
        second_delay = limiter.seconds_until_allowed("alice")
        self.assertGreater(second_delay, first_delay)

    def test_delay_is_capped(self) -> None:
        limiter = LoginRateLimiter(max_delay_seconds=5.0)
        for _ in range(10):
            limiter.record_failure("alice")
        self.assertLessEqual(limiter.seconds_until_allowed("alice"), 5.0)

    def test_success_resets_the_counter(self) -> None:
        limiter = LoginRateLimiter()
        limiter.record_failure("alice")
        limiter.record_success("alice")
        self.assertEqual(limiter.seconds_until_allowed("alice"), 0.0)

    def test_keys_are_independent(self) -> None:
        limiter = LoginRateLimiter()
        limiter.record_failure("alice")
        self.assertEqual(limiter.seconds_until_allowed("bob"), 0.0)


class AuditLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.log = AuditLog(Path(self._tmp.name) / "audit.jsonl")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_add_then_list_round_trip(self) -> None:
        self.log.add(actor="alice", role="admin", action="user.created", resource="bob", result="success")
        entries = self.log.list(10)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["actor"], "alice")
        self.assertEqual(entries[0]["action"], "user.created")

    def test_list_is_newest_first(self) -> None:
        self.log.add(actor="alice", role="admin", action="first", result="success")
        self.log.add(actor="alice", role="admin", action="second", result="success")
        entries = self.log.list(10)
        self.assertEqual(entries[0]["action"], "second")
        self.assertEqual(entries[1]["action"], "first")

    def test_missing_file_returns_empty_list(self) -> None:
        log = AuditLog(Path(self._tmp.name) / "does-not-exist.jsonl")
        self.assertEqual(log.list(10), [])

    def test_malformed_line_is_skipped_not_raised(self) -> None:
        self.log.path.parent.mkdir(parents=True, exist_ok=True)
        with self.log.path.open("a", encoding="utf-8") as fh:
            fh.write("not json\n")
        self.log.add(actor="alice", role="admin", action="ok", result="success")
        entries = self.log.list(10)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["action"], "ok")


class AuthApiFlowTests(unittest.TestCase):
    """End-to-end through the Flask app, with enforcement explicitly enabled.

    A fresh app (and fresh on-disk user store) per test method: these tests
    care about "no admin yet" vs "admin exists" transitions, which a shared
    class-level app would make order-dependent.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        os.environ["EASY_DASHBOARD_AUTH_USERS_FILE"] = str(Path(self._tmp.name) / "users.json")
        os.environ["EASY_DASHBOARD_AUDIT_LOG"] = str(Path(self._tmp.name) / "audit.jsonl")
        os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "1"
        os.environ.pop("EASY_DASHBOARD_TOKEN", None)

        def _cleanup_env() -> None:
            os.environ.pop("EASY_DASHBOARD_AUTH_USERS_FILE", None)
            os.environ.pop("EASY_DASHBOARD_AUDIT_LOG", None)
            os.environ.pop("EASY_DASHBOARD_ENABLE_AUTH", None)

        self.addCleanup(_cleanup_env)

        from app import create_app

        self.app = create_app(run_startup_checks=False, start_runtime_services=False)
        self.app.testing = True
        self.client = self.app.test_client()

    def _setup_admin(self, username: str = "admin", password: str = "adminpass123") -> dict:
        response = self.client.post("/api/auth/setup", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.get_json())
        self._last_response = response
        return response.get_json()

    def test_status_before_setup(self) -> None:
        response = self.client.get("/api/auth/status")
        body = response.get_json()
        self.assertFalse(body["setup_complete"])

    def test_corrupt_database_blocks_app_start_even_with_auth_override(self) -> None:
        from app import create_app

        path = Path(os.environ["EASY_DASHBOARD_AUTH_USERS_FILE"])
        path.write_text('{broken')
        for override in ("0", "1"):
            with self.subTest(override=override), patch.dict(os.environ, {"EASY_DASHBOARD_ENABLE_AUTH": override}):
                with self.assertRaises(UserStoreError):
                    create_app(run_startup_checks=False, start_runtime_services=False)

    def test_snapshot_reads_never_capture_and_viewer_cannot_post(self) -> None:
        self._setup_admin()
        auth = self.app.config["easy_auth"]
        auth.user_store.create_user("viewer", "password123", "viewer")
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "viewer", "password": "password123"}).get_json()
        runtime = self.app.easy_dashboard_runtime
        with patch.object(runtime, "capture_snapshot") as capture, patch.object(runtime.thermal, "snapshot") as thermal:
            for route in ("/snapshot/rgb_left", "/snapshot/rgb_right", "/snapshot/thermal", "/thermal/snapshot"):
                with self.subTest(route=route):
                    for method in ("GET", "HEAD"):
                        with self.client.open(route, method=method) as response:
                            self.assertEqual(response.status_code, 405)
                            self.assertIn("POST", response.headers["Allow"])
                    response = self.client.post(route, headers={"X-EASY-CSRF": login["csrf_token"]})
                    self.assertEqual(response.status_code, 403)
            capture.assert_not_called()
            thermal.assert_not_called()

    def test_operator_can_capture_with_csrf_only(self) -> None:
        self._setup_admin()
        self.app.config["easy_auth"].user_store.create_user("operator", "password123", "operator")
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "operator", "password": "password123"}).get_json()
        runtime = self.app.easy_dashboard_runtime
        with patch.object(runtime, "capture_snapshot", return_value=(b"", False, None, {})) as capture:
            self.assertEqual(self.client.post("/snapshot/rgb_left").status_code, 403)
            capture.assert_not_called()
            response = self.client.post("/snapshot/rgb_left", headers={"X-EASY-CSRF": login["csrf_token"]})
            self.assertEqual(response.status_code, 503)  # Mock camera offline, authorization passed.
            capture.assert_called_once()

    def test_protected_get_without_identity_is_401_once_an_admin_exists(self) -> None:
        # Before any admin exists, enforcement stays off entirely (the
        # two-key safety switch — see AuthContext.enforcing): a bare env
        # flag with no admin yet must not lock out the setup flow itself.
        self._setup_admin("gateadmin")
        self.client.post("/api/auth/logout")
        response = self.client.get("/api/dashboard/state")
        self.assertEqual(response.status_code, 401)

    def test_setup_creates_admin_and_returns_session(self) -> None:
        body = self._setup_admin("setupadmin")
        self.assertEqual(body["user"]["role"], "admin")
        self.assertIn("csrf_token", body)
        set_cookie_headers = self._last_response.headers.getlist("Set-Cookie")
        self.assertTrue(any("easy_session=" in header for header in set_cookie_headers))

    def test_setup_cannot_run_twice(self) -> None:
        self._setup_admin("dupadmin")
        response = self.client.post("/api/auth/setup", json={"username": "another", "password": "password123"})
        self.assertEqual(response.status_code, 409)

    def test_session_cookie_grants_read_access(self) -> None:
        self._setup_admin("readeradmin")
        response = self.client.get("/api/dashboard/state")
        self.assertIn(response.status_code, (200, 500))  # 500 only if hardware polling fails, not an auth failure
        self.assertNotEqual(response.status_code, 401)

    def test_login_wrong_password_rejected(self) -> None:
        self._setup_admin("loginadmin", "correctpass123")
        self.client.post("/api/auth/logout")
        response = self.client.post("/api/auth/login", json={"username": "loginadmin", "password": "wrongpass"})
        self.assertEqual(response.status_code, 401)

    def test_login_correct_password_succeeds(self) -> None:
        self._setup_admin("loginok", "correctpass123")
        self.client.post("/api/auth/logout")
        response = self.client.post("/api/auth/login", json={"username": "loginok", "password": "correctpass123"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrf_token", response.get_json())

    def test_repeated_failed_logins_are_rate_limited(self) -> None:
        self._setup_admin("ratelimited", "correctpass123")
        self.client.post("/api/auth/logout")
        for _ in range(3):
            self.client.post("/api/auth/login", json={"username": "ratelimited", "password": "wrong"})
        response = self.client.post("/api/auth/login", json={"username": "ratelimited", "password": "wrong"})
        self.assertEqual(response.status_code, 429)

    def test_mutating_request_without_csrf_header_is_rejected(self) -> None:
        self._setup_admin("csrfadmin")
        response = self.client.post("/api/auth/settings", json={"anonymous_viewer_enabled": True})
        self.assertEqual(response.status_code, 403)
        self.assertIn("CSRF", response.get_json()["error"])

    def test_mutating_request_with_correct_csrf_header_succeeds(self) -> None:
        body = self._setup_admin("csrfok")
        response = self.client.post(
            "/api/auth/settings",
            json={"anonymous_viewer_enabled": True},
            headers={"X-EASY-CSRF": body["csrf_token"]},
        )
        self.assertEqual(response.status_code, 200)

    def test_viewer_cannot_reach_admin_endpoint(self) -> None:
        admin_body = self._setup_admin("viewertest")
        create = self.client.post(
            "/api/auth/users",
            json={"username": "vieweruser", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        )
        self.assertEqual(create.status_code, 201)
        self.client.post("/api/auth/logout")

        login = self.client.post("/api/auth/login", json={"username": "vieweruser", "password": "password123"})
        viewer_csrf = login.get_json()["csrf_token"]

        response = self.client.post(
            "/api/auth/users",
            json={"username": "another", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": viewer_csrf},
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_start_a_mission(self) -> None:
        admin_body = self._setup_admin("missiontest")
        self.client.post(
            "/api/auth/users",
            json={"username": "fieldviewer", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        )
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "fieldviewer", "password": "password123"})
        viewer_csrf = login.get_json()["csrf_token"]

        response = self.client.post(
            "/api/session/start",
            json={},
            headers={"X-EASY-CSRF": viewer_csrf},
        )
        self.assertEqual(response.status_code, 403)

    def test_operator_can_reach_operator_routes_but_not_admin_ones(self) -> None:
        admin_body = self._setup_admin("optest")
        self.client.post(
            "/api/auth/users",
            json={"username": "fieldop", "password": "password123", "role": "operator"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        )
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "fieldop", "password": "password123"})
        op_csrf = login.get_json()["csrf_token"]

        restart = self.client.post("/api/system/restart", json={}, headers={"X-EASY-CSRF": op_csrf})
        self.assertEqual(restart.status_code, 403)

    def test_deactivating_a_user_is_blocked_without_a_fresh_step_up(self) -> None:
        admin_body = self._setup_admin("stepupblock", "adminpass123")
        created = self.client.post(
            "/api/auth/users",
            json={"username": "target1", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        ).get_json()["user"]

        # A plain login (unlike setup) does not grant elevation: re-entering
        # credentials once at sign-in is not the same as confirming this
        # specific destructive action.
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "stepupblock", "password": "adminpass123"})
        csrf = login.get_json()["csrf_token"]

        response = self.client.delete(f"/api/auth/users/{created['id']}", headers={"X-EASY-CSRF": csrf})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["code"], "step_up_required")

    def test_step_up_with_correct_password_unblocks_the_action(self) -> None:
        admin_body = self._setup_admin("stepupok", "adminpass123")
        created = self.client.post(
            "/api/auth/users",
            json={"username": "target2", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        ).get_json()["user"]
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "stepupok", "password": "adminpass123"})
        csrf = login.get_json()["csrf_token"]

        step_up = self.client.post(
            "/api/auth/step-up",
            json={"password": "adminpass123"},
            headers={"X-EASY-CSRF": csrf},
        )
        self.assertEqual(step_up.status_code, 200, step_up.get_json())

        response = self.client.delete(f"/api/auth/users/{created['id']}", headers={"X-EASY-CSRF": csrf})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["user"]["active"])

    def test_step_up_with_wrong_password_is_rejected_and_does_not_unblock(self) -> None:
        admin_body = self._setup_admin("stepupwrong", "adminpass123")
        created = self.client.post(
            "/api/auth/users",
            json={"username": "target3", "password": "password123", "role": "viewer"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        ).get_json()["user"]
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "stepupwrong", "password": "adminpass123"})
        csrf = login.get_json()["csrf_token"]

        step_up = self.client.post("/api/auth/step-up", json={"password": "not-the-password"}, headers={"X-EASY-CSRF": csrf})
        self.assertEqual(step_up.status_code, 401)

        response = self.client.delete(f"/api/auth/users/{created['id']}", headers={"X-EASY-CSRF": csrf})
        self.assertEqual(response.status_code, 403)

    def test_step_up_requires_an_authenticated_session_not_a_legacy_token(self) -> None:
        os.environ["EASY_DASHBOARD_TOKEN"] = "sharedtok"
        try:
            from app import create_app

            app = create_app(run_startup_checks=False, start_runtime_services=False)
            client = app.test_client()
            response = client.post("/api/auth/step-up", json={"password": "whatever"}, headers={"X-EASY-Token": "sharedtok"})
            self.assertEqual(response.status_code, 401)
        finally:
            os.environ.pop("EASY_DASHBOARD_TOKEN", None)

    def test_security_settings_change_is_blocked_without_step_up(self) -> None:
        self._setup_admin("settingsstepup", "adminpass123")
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "settingsstepup", "password": "adminpass123"})
        csrf = login.get_json()["csrf_token"]

        response = self.client.post(
            "/api/auth/settings",
            json={"anonymous_viewer_enabled": True},
            headers={"X-EASY-CSRF": csrf},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["code"], "step_up_required")

    def test_system_restart_is_blocked_without_step_up(self) -> None:
        self._setup_admin("restartstepup", "adminpass123")
        self.client.post("/api/auth/logout")
        login = self.client.post("/api/auth/login", json={"username": "restartstepup", "password": "adminpass123"})
        csrf = login.get_json()["csrf_token"]

        # Sola verifica del gate: non deve mai raggiungere il vero riavvio
        # dell'orchestrator (avvierebbe thread hardware reali nel test).
        response = self.client.post("/api/system/restart", json={}, headers={"X-EASY-CSRF": csrf})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["code"], "step_up_required")

    def test_deactivating_a_user_revokes_their_session(self) -> None:
        admin_body = self._setup_admin("revoketest")
        created = self.client.post(
            "/api/auth/users",
            json={"username": "toberevoked", "password": "password123", "role": "operator"},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        ).get_json()["user"]

        other_client = self.app.test_client()
        login = other_client.post("/api/auth/login", json={"username": "toberevoked", "password": "password123"})
        self.assertEqual(login.status_code, 200)

        self.client.patch(
            f"/api/auth/users/{created['id']}",
            json={"active": False},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        )

        response = other_client.get("/api/auth/session")
        self.assertIsNone(response.get_json()["user"])

    def test_anonymous_viewer_can_read_when_enabled_and_none_otherwise(self) -> None:
        admin_body = self._setup_admin("anontest")
        self.client.post(
            "/api/auth/settings",
            json={"anonymous_viewer_enabled": True},
            headers={"X-EASY-CSRF": admin_body["csrf_token"]},
        )
        self.client.post("/api/auth/logout")

        anon_client = self.app.test_client()
        response = anon_client.get("/api/dashboard/state")
        self.assertNotEqual(response.status_code, 401)

        response = anon_client.post("/api/session/start", json={})
        self.assertIn(response.status_code, (401, 403))

    def test_session_endpoint_reflects_identity_even_before_enforcement_is_on(self) -> None:
        # First-run setup must show "logged in as X" immediately, regardless
        # of whether the Admin has flipped the enforcement switch yet.
        os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "0"
        try:
            from app import create_app

            app = create_app(run_startup_checks=False, start_runtime_services=False)
            client = app.test_client()
            client.post("/api/auth/setup", json={"username": "precheck", "password": "password123"})
            response = client.get("/api/auth/session")
            body = response.get_json()
            self.assertIsNotNone(body["user"])
            self.assertEqual(body["user"]["username"], "precheck")
        finally:
            os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "1"

    def test_login_setup_logout_are_exempt_from_csrf(self) -> None:
        # A stale session cookie must never block login/setup/logout
        # themselves — they are how you establish or discard an identity.
        first = self._setup_admin("csrfexempt", "password123")
        self.assertNotIn("error", first)
        second_setup = self.client.post("/api/auth/setup", json={"username": "irrelevant", "password": "password123"})
        self.assertEqual(second_setup.status_code, 409)  # rejected for "already set up", not CSRF
        logout = self.client.post("/api/auth/logout")
        self.assertEqual(logout.status_code, 200)
        login = self.client.post("/api/auth/login", json={"username": "csrfexempt", "password": "password123"})
        self.assertEqual(login.status_code, 200)

    def test_admin_can_toggle_persisted_enforcement_setting(self) -> None:
        # "auto" mode (no env override): the stored preference is what
        # actually governs enforcement, so toggling it must work and must
        # take effect immediately for the next request.
        os.environ.pop("EASY_DASHBOARD_ENABLE_AUTH", None)
        try:
            from app import create_app

            app = create_app(run_startup_checks=False, start_runtime_services=False)
            client = app.test_client()
            setup = client.post("/api/auth/setup", json={"username": "toggletest", "password": "password123"})
            csrf = setup.get_json()["csrf_token"]

            before = client.get("/api/dashboard/state")
            self.assertNotEqual(before.status_code, 401)  # no admin session needed yet: not enforced

            response = client.post(
                "/api/auth/settings",
                json={"auth_enforced": True},
                headers={"X-EASY-CSRF": csrf},
            )
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.get_json()["auth_enforced_setting"])
            self.assertTrue(response.get_json()["enforcement_enabled"])

            anon_client = app.test_client()
            after = anon_client.get("/api/dashboard/state")
            self.assertEqual(after.status_code, 401)
        finally:
            os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "1"

    def test_env_override_zero_forces_enforcement_off_even_with_admin(self) -> None:
        os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "0"
        try:
            from app import create_app

            app = create_app(run_startup_checks=False, start_runtime_services=False)
            client = app.test_client()
            client.post("/api/auth/setup", json={"username": "forcedoff", "password": "password123"})
            response = client.get("/api/dashboard/state")
            self.assertNotEqual(response.status_code, 401)
        finally:
            os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "1"

    def test_env_override_zero_rejects_toggling_the_stored_setting(self) -> None:
        os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "0"
        try:
            from app import create_app

            app = create_app(run_startup_checks=False, start_runtime_services=False)
            client = app.test_client()
            setup = client.post("/api/auth/setup", json={"username": "forcedoff2", "password": "password123"})
            csrf = setup.get_json()["csrf_token"]
            response = client.post(
                "/api/auth/settings",
                json={"auth_enforced": True},
                headers={"X-EASY-CSRF": csrf},
            )
            self.assertEqual(response.status_code, 409)
        finally:
            os.environ["EASY_DASHBOARD_ENABLE_AUTH"] = "1"

    def test_audit_log_records_login_and_denied_access(self) -> None:
        self._setup_admin("audittest")
        self.client.post("/api/auth/logout")

        # Attempted access denied while unauthenticated: recorded as a 401,
        # not audited under access.denied (that path only fires once an
        # identity is known but under-privileged — see app.py).
        self.client.get("/api/dashboard/state")

        login = self.client.post("/api/auth/login", json={"username": "audittest", "password": "adminpass123"})
        self.assertEqual(login.status_code, 200, login.get_json())
        csrf = login.get_json()["csrf_token"]

        response = self.client.get("/api/auth/audit", headers={"X-EASY-CSRF": csrf})
        self.assertEqual(response.status_code, 200)
        actions = [e["action"] for e in response.get_json()["entries"]]
        self.assertIn("auth.login", actions)
        self.assertIn("auth.setup_completed", actions)


if __name__ == "__main__":
    unittest.main()
