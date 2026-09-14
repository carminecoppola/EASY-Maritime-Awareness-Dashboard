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

interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

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
  // Il cookie di sessione è HttpOnly (mai leggibile da JS): il CSRF token
  // ottenuto al login viaggia come header separato, verificato lato server
  // contro quello legato alla sessione — vedi easy_dashboard/auth.py.
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

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][]
  if (entries.length === 0) return ''
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))
  return `?${search.toString()}`
}

export const api = {
  getConfig: () => request<ConfigResponse>('/api/config'),

  // Endpoint aggregato e volutamente costoso (~2 s misurati sul Raspberry,
  // psutil incluso): con il timeout predefinito di 8 s bastava una richiesta
  // accodata per farlo abortire, lasciando la dashboard senza dati.
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
  /** Esegue l'inferenza sul frame successivo della sorgente selezionata. Attesa reale sulla CPU del Raspberry. */
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
  /** RGB left+right+thermal sotto un unico capture_set_id. Richiede una missione attiva (409 altrimenti). */
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
      // Il backend fa bool(payload[feed]): un dict è sempre truthy, quindi
      // disabilitare un feed lo abilitava. Va inviato il booleano nudo.
      body: JSON.stringify({ [feed]: enabled }),
    }),
  startStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/start`, { method: 'POST' }),
  stopStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/stop`, { method: 'POST' }),

  getFocus: (side: 'rgb_left' | 'rgb_right') => request<FocusResponse>(`/api/focus/${side}`),

  /** Ferma e riavvia i servizi hardware (camere, termico). Admin-only, richiede step-up. */
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
  /** Ri-conferma la password per sbloccare un'azione distruttiva per una finestra breve. */
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

/** Aggiunge un cache-buster: usare per <img src> di endpoint no-store (preview, thermal/frame). */
export function withCacheBuster(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}t=${Date.now()}`
}
