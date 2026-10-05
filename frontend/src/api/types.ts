/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * TypeScript types mirroring the REST contract of the Flask backend.
 *
 * There is no OpenAPI schema in the repository, so these types follow the real
 * payloads. Do not invent or rename fields here: when a nested payload has not
 * been observed in detail it stays `unknown` until a real response is captured.
 */

/** Normalised sensor availability (see `runtime_status.py` in the backend). */
export type Availability =
  | 'STREAMING'
  | 'READY'
  | 'INITIALIZING'
  | 'NOT_PRESENT'
  | 'ERROR'

/** State contract of one sensor. */
export interface RuntimeState {
  availability: Availability
  service_healthy: boolean
  detected: boolean
  streaming: boolean
  ready: boolean
}

/** Bounding box in image pixels. */
export interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type DetectionStatus = 'NEW' | 'ACTIVE' | 'RESOLVED'

/** One detected object with provenance and lifecycle status. */
export interface Detection {
  id: string
  timestamp: string
  session_id: string | null
  source: string
  source_label: string
  image_name: string
  image_path: string
  class_id: number
  class_name: string
  confidence: number
  bbox: BBox
  box_xyxy?: [number, number, number, number]
  status: DetectionStatus
  created_at: string
  updated_at: string
  track_id?: string | null
  thermal_confirmation?: unknown
  depth?: number | null
  distance?: number | null
  velocity?: number | null
  frame_id?: string | null
  source_type?: string | null
  source_name?: string | null
}

export interface DetectionsResponse {
  ok: boolean
  manager: string
  session_id: string | null
  source?: string
  source_label?: string
  last_image?: string | null
  image_path?: string | null
  last_run_ts?: string | null
  last_inference_ms?: number | null
  fps?: number | null
  error?: string | null
  count: number
  detections: Detection[]
  last_detections?: Detection[]
  last_detection?: Detection | null
  current_detections_path?: string | null
  history_path?: string | null
  updated_at: string
}

export type EventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type EventStatus = 'NEW' | 'ACTIVE' | 'RESOLVED'

/** Evento "di missione" derivato dalle detection (event_manager.py). */
export interface MissionEvent {
  event_id: string
  session_id: string | null
  type: string
  severity: EventSeverity
  status: EventStatus
  source: string
  related_detection_ids: string[]
  created_at: string
  updated_at: string
  track_id?: string | null
  thermal_confirmation?: unknown
  distance?: number | null
  priority?: number
  resolved_at?: string | null
  notes?: string | null
  update_count?: number
  last_timestamp?: string | null
  last_confidence?: number | null
  source_label?: string
  event_key?: string
  meta?: Record<string, unknown>
}

/** Log grezzo di attivita' (stores.py EventStore) — distinto da MissionEvent. */
export interface RawLogEvent {
  id: string
  timestamp: string
  source: string
  type: string
  description: string
  severity: string
  action?: string | null
  meta?: Record<string, unknown>
}

export interface EventsLogResponse {
  events: RawLogEvent[]
  count: number
  summary: { severity?: Record<string, number>; sources?: Record<string, number> }
}

/** Real wrapper of events_current/events_history inside /api/dashboard/state (verified in replay). */
export interface MissionEventsWrapper {
  ok: boolean
  count: number
  events: MissionEvent[]
  current_events?: MissionEvent[]
  current_events_path?: string
  history_path?: string
  updated_at: string
}

export type SessionRunStatus = 'RUNNING' | 'STOPPED'

export interface SessionEditable {
  operator?: string
  notes?: string
  campaign?: string
  location?: string
  weather?: string
}

/** One mission with its metadata, metrics and manifest summary. */
export interface Session {
  ok: boolean
  session_id: string | null
  start_time: string | null
  end_time: string | null
  duration: number | null
  status: SessionRunStatus | null
  mode?: string | null
  operator?: string | null
  hostname?: string | null
  model_name?: string | null
  model_type?: string | null
  project_version?: string | null
  notes?: string | null
  editable?: SessionEditable
  path?: string | null
  updated_at?: string
}

export interface SessionStatusResponse {
  ok: boolean
  running: boolean
  current: Session | null
  latest: Session | null
  recent: Session[]
  count: number
  index_path?: string
  sessions_root?: string
  updated_at: string
}

/** Counters of a mission manifest: items, snapshots, inferences, detections and RGB/thermal pairing. */
export interface SessionManifestCounts {
  items: number
  snapshots: number
  inference: number
  detections: number
  samples: number
  paired_items: number
  paired_capture_sets?: number
  within_tolerance_samples?: number
  synchronized_samples: number
  by_feed: Record<string, number>
}

export interface SessionManifest {
  ok: boolean
  schema: string
  session_id: string | null
  counts: SessionManifestCounts
  items: unknown[]
  updated_at: string
}

/** Host information from `/system`. */
export interface SystemDiagnostics {
  hostname: string
  ip_address: string
  model: string
  os_release: string
  python_version: string
  cpu_temperature_c: number | null
  cpu_percent: number
  ram: { total_mb: number; used_mb: number; available_mb: number; percent: number }
  disk: { total_gb: number; used_gb: number; free_gb: number; percent: number }
  uptime_seconds: number
  uptime_human: string
  vcgencmd_get_camera?: string | null
}

export interface RgbCamera {
  logical_name: string
  hardware_name: string
  state: string
  fps: number | null
  /** Epoch in seconds (time.time()), not an ISO string. */
  last_acquisition_ts: number | string | null
  error: string | null
  enabled: boolean
  message: string | null
}

export interface CameraInventory {
  uc512_multiplexer: unknown
  rgb_cameras: RgbCamera[]
  thermal_camera: Record<string, unknown>
  camera_tools?: unknown
  raw_libcamera_output?: unknown
  camera_entries?: unknown
}

/** One stored snapshot. */
export interface Snapshot {
  filename: string
  feed: string
  feed_label?: string
  source?: string
  url: string
  download_url?: string
  path?: string
  size_bytes?: number
  created?: string
  created_ts?: number
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export interface SnapshotFeedInfo {
  folder: string
  label: string
  source: string
}

export interface SnapshotsRecentResponse {
  count: number
  items: Snapshot[]
  feeds: Record<string, SnapshotFeedInfo>
  summary?: Record<string, unknown>
}

export interface StreamState {
  enabled: boolean
  /** Full camera state (camera_state, fps, status...), not a string. */
  state: Record<string, unknown>
}

export interface StreamStateResponse {
  rgb_left: StreamState
  rgb_right: StreamState
}

export interface FocusResponse {
  ok: boolean
  side: string
  score: number
}

/** A frame source as listed by the source manager. */
export interface SourceInfo {
  id: string
  [key: string]: unknown
}

export interface SourcesResponse {
  sources: SourceInfo[]
  /** Full source object, not a string; verified against a real payload. */
  selected_source: SourceInfo | null
  selected_source_id: string | null
}

/** A device as listed by the device manager. */
export interface DeviceInfo {
  device_id: string
  device_name: string
  device_type: string
  [key: string]: unknown
}

export interface DevicesResponse {
  devices: DeviceInfo[]
}

export interface AcquisitionStatus {
  running: boolean
  manifest_counts?: SessionManifestCounts
  dataset_summary?: unknown
  [key: string]: unknown
}

/** POST /api/acquisition/capture-set: a single capture_set_id for RGB left/right + thermal. */
export interface CaptureSetResponse {
  ok: boolean
  complete: boolean
  capture_set_id: string
  sample_id: string
  successful_feeds: number
  total_feeds: number
  captures: Record<string, { ok: boolean; snapshot: Snapshot | null; error: string | null }>
  pairing?: {
    status: 'paired_unmeasured' | 'within_tolerance' | 'out_of_tolerance' | 'missing_rgb' | 'missing_thermal'
    observed_wall_skew_ms: number | null
    hardware_synchronized: boolean
  }
  manifest_counts?: SessionManifestCounts
}

export interface DatasetExportStatus {
  ok: boolean
  [key: string]: unknown
}

export interface DatasetValidationResult {
  ok: boolean
  error?: string
  session_id?: string
  valid?: boolean
  valid_samples?: number
  incomplete_samples?: number
  excluded_items?: number
  [key: string]: unknown
}

/** /thermal/status has no top-level "ok" field — verified against a real payload. */
export interface ThermalStatusResponse {
  status: string
  detected: boolean
  device: string
  discovery_method: string
  error: string
  mode: string
  streaming: boolean
  runtime_state: RuntimeState & { capture_mode?: string }
  [key: string]: unknown
}

/** Una riga di health.system_components.components — verificato contro un payload reale. */
export interface SystemComponentStatus {
  id: string
  label: string
  kind: string
  active: boolean
  critical: boolean
  status: string
  health: string
  error: string
  uptime: string
  uptime_seconds: number
  last_seen: string
  details?: Record<string, unknown>
}

export interface SystemComponentsPayload {
  active_count: number
  components: SystemComponentStatus[]
}

/** Full diagnostic payload of `/health`. */
export interface HealthResponse {
  ok: boolean
  service: string
  timestamp: string
  /** Same payload as GET /system, already included here: do not poll it separately. */
  system?: SystemDiagnostics
  system_orchestrator?: unknown
  system_components?: SystemComponentsPayload
  cameras?: unknown
  sources?: unknown
  rgb?: unknown
  thermal?: unknown
  runtime_state: { rgb: RuntimeState; thermal: RuntimeState }
  inference?: unknown
  detection_manager?: unknown
  session?: unknown
  devices?: unknown
  operations?: unknown
  events_count?: number
}

/** GET /api/inference/status — campi verificati contro un payload reale. */
export interface InferenceStatus {
  ok: boolean
  running: boolean
  mode: string
  backend: string
  backend_status?: {
    loaded?: boolean
    cpu_threads?: number
    execution_mode?: string
    graph_optimization?: string
    error?: string
  }
  model_path?: string
  config_path?: string
  config_error?: string
  error?: string
  source?: string
  source_label?: string
  source_status?: string
  count?: number
  fps?: number | null
  interval_seconds?: number
  last_image?: string | null
  last_inference_ms?: number | null
  last_run_ts?: string | null
  updated_at?: string
  [key: string]: unknown
}

/** POST /api/inference/run-on-next-frame */
export interface InferenceRunResult {
  ok: boolean
  error?: string
  count?: number
  detections?: Detection[]
  last_inference_ms?: number | null
  last_image?: string | null
  [key: string]: unknown
}

/** Compact operator status from `/api/status/summary`. */
export interface StatusSummaryResponse {
  ok: boolean
  operator_state: string
  live: Record<string, unknown>
  mission: Record<string, unknown>
  dataset?: Record<string, unknown>
  ai?: Record<string, unknown>
  activity?: Record<string, unknown>
}

/**
 * Aggregated payload of /api/dashboard/state, the primary polling source for the
 * Live Overview. The backend computes detections and session state once for this
 * response: do NOT split it into separate calls for the same data.
 */
export interface DashboardState {
  ok: boolean
  timestamp: string
  health: HealthResponse
  events: EventsLogResponse
  snapshots: SnapshotsRecentResponse
  sources: SourcesResponse
  devices: DevicesResponse
  inference: unknown
  detections: DetectionsResponse
  session: SessionStatusResponse
  acquisition: AcquisitionStatus
  events_current: MissionEventsWrapper
  events_history: MissionEventsWrapper
  frame_provider: unknown
  system_status: unknown
  system_components: unknown
}

export interface ConfigResponse {
  auth_required: boolean
}

// Local authentication: see easy_dashboard/auth.py for the backend contract. Do
// not confuse it with Session/SessionStatusResponse above: those are the
// operational "missions", this is the operator's login.

/** Role ranking: viewer < operator < admin. */
export type AuthRole = 'viewer' | 'operator' | 'admin'

export interface AuthUser {
  id: string
  username: string
  role: AuthRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface AuthStatusResponse {
  ok: boolean
  setup_complete: boolean
  /** Effective state, already accounting for any environment override. */
  enforcement_enabled: boolean
  /** Preference stored by the Admin. It can differ from enforcement_enabled
   * when the process overrides it (see enforcement_forced_by_server). */
  auth_enforced_setting: boolean
  /** true/false when the server forces the state, null when it follows the stored preference. */
  enforcement_forced_by_server: boolean | null
  anonymous_viewer_enabled: boolean
  /** Nome del dispositivo, mostrato sulla schermata di login prima di autenticarsi. */
  hostname: string | null
}

export interface AuthSessionResponse {
  ok: boolean
  user: AuthUser | null
  csrf_token?: string | null
  /** true when the identity comes from the legacy shared token, not from a real login. */
  legacy?: boolean
  /** true nella breve finestra dopo aver ri-confermato la password (step-up). */
  elevated?: boolean
  elevated_until?: number | null
}

/** Corpo di un 403 con `code: "step_up_required"` — vedi easy_dashboard/auth.py. */
export interface StepUpRequiredError {
  ok: false
  code: 'step_up_required'
  error: string
  step_up_window_seconds?: number
}

/** Type guard for `StepUpRequiredError` bodies. */
export function isStepUpRequiredBody(body: unknown): body is StepUpRequiredError {
  return Boolean(body) && typeof body === 'object' && (body as { code?: unknown }).code === 'step_up_required'
}

/** One entry of the authentication audit log. */
export interface AuditEntry {
  timestamp: string
  actor: string
  role: AuthRole | null
  action: string
  resource: string | null
  result: string
  client_ip: string | null
  detail: string | null
}

export interface ApiErrorBody {
  ok?: false
  error?: string
  [key: string]: unknown
}
