// Tipi che rispecchiano il contratto REST del backend Flask (nessuno schema
// OpenAPI esiste nel repo). Non inventare/rinominare campi qui: se un payload
// nested non e' ancora stato osservato in dettaglio resta `unknown` finche'
// non viene catturata una risposta reale in modalita' replay.

export type Availability =
  | 'STREAMING'
  | 'READY'
  | 'INITIALIZING'
  | 'NOT_PRESENT'
  | 'ERROR'

export interface RuntimeState {
  availability: Availability
  service_healthy: boolean
  detected: boolean
  streaming: boolean
  ready: boolean
}

export interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type DetectionStatus = 'NEW' | 'ACTIVE' | 'RESOLVED'

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

/** Wrapper reale di events_current/events_history dentro /api/dashboard/state (verificato in replay). */
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

export interface SessionManifestCounts {
  items: number
  snapshots: number
  inference: number
  detections: number
  samples: number
  paired_items: number
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
  last_acquisition_ts: string | null
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
  state: string
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

export interface SourceInfo {
  id: string
  [key: string]: unknown
}

export interface SourcesResponse {
  sources: SourceInfo[]
  /** Oggetto sorgente completo, non una stringa — verificato contro un payload reale. */
  selected_source: SourceInfo | null
  selected_source_id: string | null
}

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

export interface DatasetExportStatus {
  ok: boolean
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

export interface HealthResponse {
  ok: boolean
  service: string
  timestamp: string
  system?: unknown
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
 * Payload aggregato di /api/dashboard/state — fonte primaria di polling per
 * la Live Overview. Il backend calcola detection/session una sola volta per
 * questa risposta: NON frammentare in chiamate separate per gli stessi dati.
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

export interface ApiErrorBody {
  ok?: false
  error?: string
  [key: string]: unknown
}
