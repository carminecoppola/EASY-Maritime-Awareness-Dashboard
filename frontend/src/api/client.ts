import { getAuthToken } from './config'
import type {
  AcquisitionStatus,
  CameraInventory,
  ConfigResponse,
  DashboardState,
  DatasetExportStatus,
  DetectionsResponse,
  DevicesResponse,
  EventsLogResponse,
  FocusResponse,
  HealthResponse,
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

  getDashboardState: (params: { events_limit?: number; snapshots_limit?: number } = {}) =>
    request<DashboardState>(`/api/dashboard/state${qs(params)}`),

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
  validateDataset: (sessionId?: string) =>
    request(`/api/dataset/validate${qs({ session_id: sessionId })}`),
  exportDataset: (payload: { session_id: string; validation_percent?: number }) =>
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
      body: JSON.stringify({ [feed]: { enabled } }),
    }),
  startStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/start`, { method: 'POST' }),
  stopStream: (feed: 'rgb_left' | 'rgb_right') => request(`/video/${feed}/stop`, { method: 'POST' }),

  getFocus: (side: 'rgb_left' | 'rgb_right') => request<FocusResponse>(`/api/focus/${side}`),
}

/** Aggiunge un cache-buster: usare per <img src> di endpoint no-store (preview, thermal/frame). */
export function withCacheBuster(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}t=${Date.now()}`
}
