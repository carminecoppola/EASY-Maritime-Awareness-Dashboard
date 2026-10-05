/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Typed HTTP client for the dashboard backend.
 *
 * Every call goes through `request`, which adds an 8 s timeout (override per
 * call), the JSON content type, and, for state-changing methods, the optional
 * shared token (`X-EASY-Token`) and the session CSRF token (`X-EASY-CSRF`).
 * Non-2xx answers become an `ApiError` carrying the status and parsed body.
 */

import { getAuthToken, getCsrfToken } from './config'
import type {
  AcquisitionStatus,
  AuditEntry,
  AuthSessionResponse,
  AuthStatusResponse,
  AuthUser,
  CameraInventory,
  CaptureSetResponse,
  ConfigResponse,
  DashboardState,
  DatasetExportStatus,
  DatasetValidationResult,
  DetectionsResponse,
  DevicesResponse,
  EventsLogResponse,
  FocusResponse,
  HealthResponse,
  InferenceRunResult,
  InferenceStatus,
  MissionEventsWrapper,
  SessionManifest,
  SessionStatusResponse,
  Snapshot,
  SnapshotsRecentResponse,
  SourcesResponse,
  StatusSummaryResponse,
  StreamStateResponse,
  SystemDiagnostics,
  ThermalStatusResponse,
} from './types'

/** Error thrown for a non-2xx response; carries the HTTP `status` and the parsed `body`. */
export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** `fetch` options plus a per-call timeout in milliseconds. */
interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Parse a response body as JSON, returning null when it is not valid JSON. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Issue a request and return the parsed JSON (null for 204). Aborts after `timeoutMs` (default 8000). */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000)
  const method = (opts.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> | undefined),
  }
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getAuthToken()
  if (token && !SAFE_METHODS.has(method)) {
    headers['X-EASY-Token'] = token
  }
  // The session cookie is HttpOnly (never readable from JavaScript): the CSRF
  // token obtained at login travels as a separate header and is checked by the
  // server against the one bound to the session (see easy_dashboard/auth.py).
  const csrf = getCsrfToken()
  if (csrf && !SAFE_METHODS.has(method) && !headers['X-EASY-CSRF']) {
    headers['X-EASY-CSRF'] = csrf
  }
  try {
    const res = await fetch(path, { ...opts, method, headers, signal: controller.signal })
    if (!res.ok) {
      const body = await safeJson(res)
      throw new ApiError(res.status, body, `HTTP ${res.status} on ${path}`)
    }
    if (res.status === 204) {
      return null as T
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Build a query string from the defined entries of `params` (empty string when none). */
function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][]
  if (entries.length === 0) return ''
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))
  return `?${search.toString()}`
}

/** One method per backend endpoint, grouped by area: status, sources, inference, detections, missions, dataset, snapshots, thermal, streams, auth. */
export const api = {
  getConfig: () => request<ConfigResponse>('/api/config'),

  // Aggregated endpoint, deliberately expensive (about 2 s measured on the
  // Raspberry, psutil included): with the default 8 s timeout a single queued
  // request was enough to abort it and leave the dashboard without data.
  getDashboardState: (params: { events_limit?: number; snapshots_limit?: number } = {}) =>
    request<DashboardState>(`/api/dashboard/state${qs(params)}`, { timeoutMs: 20000 }),

  getHealth: () => request<HealthResponse>('/health'),
  getHealthReady: () => request<{ ok: boolean; service: string; orchestrator_status: string }>('/health/ready'),
  getStatusSummary: () => request<StatusSummaryResponse>('/api/status/summary'),
  getSystem: () => request<SystemDiagnostics>('/system'),
  getCameras: () => request<CameraInventory>('/cameras'),

  getSourcesStatus: () => request<SourcesResponse>('/api/sources/status'),
  refreshSources: () => request('/api/sources/refresh', { method: 'POST' }),
  selectSource: (sourceId: string) =>
    request('/api/sources/select', { method: 'POST', body: JSON.stringify({ source_id: sourceId }) }),

  getDevicesStatus: () => request<DevicesResponse>('/api/devices/status'),
  refreshDevices: () => request('/api/devices/refresh', { method: 'POST' }),

  getInferenceStatus: () => request<InferenceStatus>('/api/inference/status'),
  /** Runs inference on the next frame of the selected source. It really waits for the Raspberry CPU. */
  runInferenceOnNextFrame: () =>
    request<InferenceRunResult>('/api/inference/run-on-next-frame', { method: 'POST', timeoutMs: 60000 }),
  startInference: () => request<{ ok: boolean }>('/api/inference/start', { method: 'POST' }),
  stopInference: () => request<{ ok: boolean }>('/api/inference/stop', { method: 'POST' }),

  getDetectionsCurrent: () => request<DetectionsResponse>('/api/detections/current'),
  getDetectionHistory: () => request<DetectionsResponse>('/api/detection/history'),
  clearDetections: () => request('/api/detection/clear', { method: 'POST' }),

  getMissionEventsCurrent: () => request<MissionEventsWrapper>('/api/events/current'),
  getMissionEventsHistory: () => request<MissionEventsWrapper>('/api/events/history'),
  clearMissionEvents: () => request('/api/events/clear', { method: 'POST' }),

  getEventsLog: (limit = 50) => request<EventsLogResponse>(`/events?limit=${limit}`),

  startSession: (payload: { mode?: string; operator?: string; notes?: string }) =>
    request<{ ok: boolean; message: string; session: unknown }>('/api/session/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  stopSession: () =>
    request<{ ok: boolean; message: string; session: unknown }>('/api/session/stop', { method: 'POST' }),
  getSessionStatus: () => request<SessionStatusResponse>('/api/session/status'),
  getSessionManifest: (sessionId?: string) =>
    request<SessionManifest>(`/api/session/manifest${qs({ session_id: sessionId })}`),
  getSessionList: () => request<{ sessions: unknown[] }>('/api/session/list'),

  getAcquisitionStatus: () => request<AcquisitionStatus>('/api/acquisition/status'),
  /** Atomic RGB left+right plus a thermal frame, paired under one capture_set_id. Needs a running mission. */
  captureAcquisitionSet: () =>
    request<CaptureSetResponse>('/api/acquisition/capture-set', { method: 'POST', timeoutMs: 20000 }),
  validateDataset: (sessionId?: string) =>
    request<DatasetValidationResult>(`/api/dataset/validate${qs({ session_id: sessionId })}`),
  exportDataset: (payload: { session_id?: string; validation_percent?: number }) =>
    request<DatasetExportStatus>('/api/dataset/export', { method: 'POST', body: JSON.stringify(payload) }),
  getDatasetExportStatus: () => request<DatasetExportStatus>('/api/dataset/export/status'),

  getSnapshotsRecent: (limit = 24) => request<SnapshotsRecentResponse>(`/api/snapshots/recent?limit=${limit}`),
  takeSnapshot: (feed: 'rgb_left' | 'rgb_right') =>
    request<{ ok: boolean; feed: string; snapshot: Snapshot }>(`/snapshot/${feed}`, { method: 'POST' }),

  getThermalStatus: () => request<ThermalStatusResponse>('/thermal/status'),
  refreshThermal: () => request('/thermal/refresh', { method: 'POST' }),
  takeThermalSnapshot: () =>
    request<{ ok: boolean; snapshot: Snapshot }>('/thermal/snapshot', { method: 'POST' }),

  getStreamState: () => request<StreamStateResponse>('/api/stream-state'),
  setStreamState: (feed: 'rgb_left' | 'rgb_right', enabled: boolean) =>
    request<StreamStateResponse>('/api/stream-state', {
      method: 'POST',
      // The backend does bool(payload[feed]): a dict is always truthy, so
      // disabling a feed used to enable it. Send the bare boolean.
      body: JSON.stringify({ [feed]: enabled }),
    }),
  startStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/start`, { method: 'POST' }),
  stopStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/stop`, { method: 'POST' }),

  getFocus: (side: 'rgb_left' | 'rgb_right') => request<FocusResponse>(`/api/focus/${side}`),

  /** Stops and restarts the hardware services (cameras, thermal). Admin only, needs step-up. */
  restartSystemServices: () => request<{ ok: boolean }>('/api/system/restart', { method: 'POST', timeoutMs: 30000 }),

  getAuthStatus: () => request<AuthStatusResponse>('/api/auth/status'),
  getAuthSession: () => request<AuthSessionResponse>('/api/auth/session'),
  authSetup: (payload: { username: string; password: string; allow_anonymous_viewer?: boolean }) =>
    request<{ ok: boolean; user: AuthUser; csrf_token: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  authLogin: (payload: { username: string; password: string }) =>
    request<{ ok: boolean; user: AuthUser; csrf_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  authLogout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  /** Re-confirms the password to unlock a destructive action for a short window. */
  authStepUp: (payload: { password: string }) =>
    request<{ ok: boolean; elevated_until: number | null }>('/api/auth/step-up', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listAuthUsers: () => request<{ ok: boolean; users: AuthUser[] }>('/api/auth/users'),
  createAuthUser: (payload: { username: string; password: string; role: string }) =>
    request<{ ok: boolean; user: AuthUser }>('/api/auth/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateAuthUser: (userId: string, payload: { role?: string; active?: boolean; new_password?: string }) =>
    request<{ ok: boolean; user: AuthUser }>(`/api/auth/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deactivateAuthUser: (userId: string) =>
    request<{ ok: boolean; user: AuthUser }>(`/api/auth/users/${userId}`, { method: 'DELETE' }),

  updateAuthSettings: (payload: { anonymous_viewer_enabled?: boolean; auth_enforced?: boolean }) =>
    request<{ ok: boolean; anonymous_viewer_enabled: boolean; auth_enforced_setting: boolean; enforcement_enabled: boolean }>(
      '/api/auth/settings',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  getAuditLog: (limit = 100) => request<{ ok: boolean; entries: AuditEntry[]; count: number }>(`/api/auth/audit?limit=${limit}`),
}

/** Appends a cache buster: use it for <img src> of no-store endpoints (preview, thermal/frame). */
export function withCacheBuster(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}t=${Date.now()}`
}
