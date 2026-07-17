function stateTone(state) {
  const value = String(state || "--").toUpperCase();
  if (["ONLINE", "DETECTED", "READY", "OK", "STREAMING", "RUNNING", "CONNECTED"].includes(value)) return { badge: "online", dot: "state-dot-online" };
  if (["BUSY", "WARNING", "WARN"].includes(value)) return { badge: "warning", dot: "state-dot-warning" };
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED", "STOPPED"].includes(value)) return { badge: "error", dot: "state-dot-error" };
  if (["STARTING", "LOADING", "WAITING", "CHECKING", "INITIALIZING"].includes(value)) return { badge: "loading", dot: "state-dot-loading" };
  return { badge: "muted", dot: "state-dot-muted" };
}

function humanStateLabel(state) {
  const value = String(state || "--").toUpperCase();
  const map = {
    ONLINE: "Live",
    DETECTED: "Rilevato",
    READY: "Pronto",
    OK: "Pronto",
    BUSY: "Recupero in corso",
    WARNING: "Da verificare",
    WARN: "Da verificare",
    OFFLINE: "Non disponibile",
    ERROR: "Errore",
    FAILED: "Errore",
    DISABLED: "Disabilitato",
    STARTING: "Avvio",
    LOADING: "Caricamento",
    WAITING: "In attesa",
    CHECKING: "Verifica in corso",
    INITIALIZING: "Inizializzazione",
    PAUSED: "In pausa",
    STREAMING: "In esecuzione",
    CONNECTED: "Collegato",
    DISCONNECTED: "Scollegato",
    NOT_AVAILABLE: "Non disponibile",
    NOT_PRESENT: "Non collegato",
    UNKNOWN: "Sconosciuto",
    REAL: "Live",
    MOCK: "Simulazione",
    NOT_DETECTED: "Non rilevato",
    PENDING: "Avvio",
    RUNNING: "In esecuzione",
    STOPPED: "Fermo",
  };
  return map[value] || (state || "--");
}

function eventSeverityLabel(severity) {
  const labels = {
    critical: "Critica",
    high: "Alta priorità",
    medium: "Media priorità",
    low: "Bassa priorità",
    info: "Informativa",
  };
  const value = String(severity || "info").toLowerCase();
  return labels[value] || humanStateLabel(value);
}

function eventStatusLabel(status) {
  const labels = { new: "Nuovo", active: "Attivo", resolved: "Risolto", idle: "In attesa" };
  const value = String(status || "new").toLowerCase();
  return labels[value] || humanStateLabel(value);
}

function thermalVisualState(thermal, fallback = {}) {
  const payload = thermal || {};
  const runtimeState = payload.runtime_state || fallback.runtime_state || {};
  const state = String(runtimeState.availability || payload.status || fallback.state || payload.mode || "UNKNOWN").toUpperCase();
  const lastFrame = payload.last_frame_ts || payload.last_acquisition_ts || fallback.last_frame_ts || null;
  const detected = runtimeState.detected ?? Boolean(payload.detected || lastFrame);
  const fresh = runtimeState.fresh ?? isFreshTimestamp(lastFrame);
  const tone = liveFeedTone(state, "thermal", lastFrame, detected);
  const startupStates = new Set(["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING", "INITIALIZING"]);
  const unavailableStates = new Set(["OFFLINE", "ERROR", "FAILED", "NOT_DETECTED", "DISABLED"]);
  const readyOnDemand = (
    runtimeState.capture_mode === "on_demand"
    && runtimeState.ready === true
    && runtimeState.streaming !== true
  ) || (detected && state === "READY");
  const hasCachedFrame = Boolean(lastFrame);
  if (readyOnDemand) {
    tone.offline = false;
    tone.loading = false;
    tone.dot = "state-dot-online";
    tone.badge = "online";
  } else if (detected && hasCachedFrame && !unavailableStates.has(state)) {
    tone.offline = false;
    tone.loading = false;
    tone.dot = "state-dot-warning";
    tone.badge = "warning";
  } else if (!fresh && startupStates.has(state)) {
    tone.offline = false;
    tone.loading = true;
    tone.dot = "state-dot-loading";
    tone.badge = "loading";
  } else if (!fresh) {
    tone.offline = true;
    tone.loading = false;
    tone.dot = detected ? "state-dot-error" : "state-dot-muted";
    tone.badge = detected ? "error" : "muted";
  }
  return {
    state,
    lastFrame,
    detected,
    fresh,
    tone,
    hasCachedFrame,
    readyOnDemand,
    label: readyOnDemand ? "Pronta su richiesta" : hasCachedFrame && !fresh && !tone.offline ? "Ultimo frame" : tone.offline ? "Nessun segnale" : humanStateLabel(state),
    statusText: readyOnDemand && !hasCachedFrame
      ? "SU RICHIESTA"
      : hasCachedFrame && !fresh && !tone.offline
        ? "ULTIMO FRAME"
        : !fresh && startupStates.has(state)
      ? "CARICANDO"
      : !fresh
        ? "NESSUN SEGNALE"
        : liveStatusText("thermal", state, payload.fps ?? payload.frame_rate, lastFrame, detected),
  };
}

function liveFeedTone(state, feed, lastFrameTs = null, detected = true) {
  const value = String(state || "").toUpperCase();
  const fresh = isFreshTimestamp(lastFrameTs);
  if (["OFFLINE", "ERROR", "FAILED"].includes(value)) return { dot: "state-dot-error", badge: "error", offline: true, loading: false };
  if (["NOT_DETECTED", "DISABLED"].includes(value)) return { dot: "state-dot-muted", badge: "muted", offline: true, loading: false };
  if (["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING"].includes(value)) return { dot: "state-dot-loading", badge: "loading", offline: false, loading: true };
  if (["BUSY", "WARNING", "WARN"].includes(value)) return { dot: "state-dot-warning", badge: "warning", offline: false, loading: false };
  if (["ONLINE", "DETECTED", "READY", "OK", "REAL", "REALTIME", "MOCK", "LIVE"].includes(value) && fresh) {
    return { dot: "state-dot-online", badge: "online", offline: false, loading: false };
  }
  if (!fresh) return { dot: detected ? "state-dot-error" : "state-dot-muted", badge: detected ? "error" : "muted", offline: true, loading: false };
  return { dot: "state-dot-muted", badge: "muted", offline: false, loading: false };
}

function liveStatusText(feed, state, fps, lastFrameTs = null, detected = true) {
  const value = String(state || "").toUpperCase();
  const fresh = isFreshTimestamp(lastFrameTs);
  if (feed === "thermal") {
    if (["NOT_DETECTED", "DISABLED"].includes(value)) return "NON RILEVATO";
    if (["OFFLINE", "ERROR", "FAILED"].includes(value)) return "NESSUN SEGNALE";
    if (["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING"].includes(value)) return "CARICANDO";
    if (["INITIALIZING"].includes(value)) return fresh ? "REALE" : "CARICANDO";
    if (!fresh) return "NESSUN SEGNALE";
    if (value === "MOCK") return "SIMULAZIONE";
    return "REALE";
  }
  if (["NOT_DETECTED"].includes(value)) return "NON RILEVATO";
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED"].includes(value)) return "NESSUN SEGNALE";
  if (!fresh) return "NESSUN SEGNALE";
  if (["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING"].includes(value)) return "CARICANDO";
  if (["ONLINE", "DETECTED", "READY", "OK"].includes(value)) {
    const rate = fps != null && Number.isFinite(Number(fps)) ? `${Math.round(Number(fps))}fps` : "LIVE";
    return `LIVE ${rate}`;
  }
  return "LIVE";
}

function buildFeedGuidance(feed, state, message) {
  const value = String(state || "").toUpperCase();
  if (value === "ONLINE") {
    return feed === "thermal"
      ? "Thermal preview is updating. Use the thermal page if you need deeper details or anomaly history."
      : "Live preview is updating correctly. You can save a snapshot at any time.";
  }
  if (["BUSY", "STARTING", "WAITING", "LOADING", "CHECKING", "PENDING"].includes(value)) {
    return feed === "thermal"
      ? "The thermal feed is starting. Wait a moment, then check again before opening diagnostics."
      : "The camera is detected but not ready yet. Wait a moment, then try reconnect if the image does not appear.";
  }
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED", "NOT_DETECTED"].includes(value)) {
    return feed === "thermal"
      ? "Thermal preview is unavailable. Check the thermal page first, then diagnostics only if the sensor stays unavailable."
      : "This camera is not providing a usable feed right now. Try reconnect first, then open diagnostics only if it stays offline.";
  }
  return message || "Status is being updated.";
}

function humanFeedMessage(feed, state, message) {
  const value = String(state || "").toUpperCase();
  if (value === "ONLINE") return feed === "thermal" ? "Thermal preview is updating." : "Live preview is updating.";
  if (value === "BUSY") return feed === "thermal" ? "The thermal sensor is trying to recover." : "The camera feed is trying to recover.";
  if (["STARTING", "WAITING", "LOADING", "CHECKING", "PENDING"].includes(value)) {
    return feed === "thermal" ? "The thermal sensor is starting up." : "The camera is detected and waiting for the first usable frame.";
  }
  if (["OFFLINE", "ERROR", "FAILED", "NOT_DETECTED"].includes(value)) {
    return feed === "thermal" ? "Thermal preview is unavailable right now." : "This camera is unavailable right now.";
  }
  if (["DISABLED", "PAUSED"].includes(value)) return feed === "thermal" ? "Thermal preview is paused." : "This camera feed is paused.";
  return message || "Status is being updated.";
}

function renderKeyValueList(nodeId, items) {
  const node = byId(nodeId);
  if (!node) return;
  if (!items || !items.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>System status is being loaded</strong><p>More details will appear as soon as the dashboard receives live data.</p></div>`;
    return;
  }
  node.innerHTML = items.map((item) => `
        <div class="placeholder-item${item.tone ? ` placeholder-item-${item.tone}` : ""}">
          <strong>${escapeHtml(item.label)}</strong>
          <p>${escapeHtml(item.value)}</p>
        </div>
      `).join("");
}

function renderHealthSummary(nodeId, items) {
  const node = byId(nodeId);
  if (!node) return;
  if (!items || !items.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>System status is being loaded</strong><p>Health data will appear here once the current session is available.</p></div>`;
    return;
  }
  node.innerHTML = items.map((item) => `
        <div class="health-pill${item.tone ? ` health-pill-${item.tone}` : ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `).join("");
}

function renderSourcePanel(payload) {
  const grid = byId(liveActionElementId("sourceGrid"));
  const selectedBadge = byId(liveActionElementId("sourceSelectedBadge"));
  if (!grid || !selectedBadge) return;
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const selected = payload?.selected_source || null;
  selectedBadge.textContent = selected?.name ? `In uso: ${selected.name}` : "In uso: --";

  if (!sources.length) {
    grid.innerHTML = `
      <div class="placeholder-item">
        <strong>Nessuna sorgente registrata</strong>
        <p>Le sorgenti video disponibili compariranno qui.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = sources.map((source) => {
    const tone = stateTone(source.status);
    const label = humanStateLabel(source.status);
    const isSelected = Boolean(source.selected);
    const capabilities = source.capabilities || {};
    const availability = source.availability || {};
    const selectable = availability.selectable !== false && capabilities.inference === true;
    const availabilityLabel = isSelected ? "In uso" : selectable ? "Disponibile" : "Non disponibile";
    const availabilityTone = isSelected ? "online" : selectable ? "muted" : "error";
    const updated = source.last_update ? formatRomeDateTime(source.last_update) : "--";
    const sourceTypeLabels = {
      replay_folder: "Archivio replay",
      camera_placeholder: "Camera RGB",
      thermal_placeholder: "Camera termica",
    };
    const sourceTypeLabel = sourceTypeLabels[source.type] || String(source.type || "Sorgente").replace(/_/g, " ");
    const sourceIcon = source.type === "replay_folder" ? "↻" : source.type === "thermal_placeholder" ? "◈" : "▣";
    const configBits = [];
    configBits.push(sourceTypeLabel);
    if (source.configuration?.replay_dir) configBits.push(compactPath(source.configuration.replay_dir));
    if (source.configuration?.provider) configBits.push(source.configuration.provider);
    return `
      <article class="source-card source-row${isSelected ? " is-selected" : ""}">
        <div class="source-card-head">
          <span class="source-row-icon" aria-hidden="true">${sourceIcon}</span>
          <div>
            <span class="source-card-name">${escapeHtml(source.name || source.id || "--")}</span>
            <p class="source-card-subtitle">${escapeHtml(sourceTypeLabel)}</p>
          </div>
        </div>
        <div class="source-card-body">
          <span class="badge badge-${availabilityTone}">${escapeHtml(availabilityLabel)}</span>
        </div>
        <div class="source-card-actions">
          ${!isSelected && selectable ? `<button class="btn btn-small btn-ghost" type="button" data-source-select="${escapeHtml(source.id || "")}">Seleziona</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function formatAiBBox(box) {
  const normalized = normalizeBBox(box);
  if (!normalized) return "BBox: --";
  const [x1, y1, x2, y2] = normalized;
  if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) return "BBox: --";
  return `BBox: ${Math.round(x1)}, ${Math.round(y1)}, ${Math.round(x2)}, ${Math.round(y2)}`;
}

function normalizeBBox(box) {
  if (Array.isArray(box) && box.length === 4) return box.map((value) => Number(value));
  if (box && typeof box === "object") return [box.x1, box.y1, box.x2, box.y2].map((value) => Number(value));
  return null;
}

function compactPath(value) {
  const text = String(value || "");
  if (!text) return "--";
  const parts = text.split("/").filter(Boolean);
  if (parts.length <= 3) return text;
  return `.../${parts.slice(-3).join("/")}`;
}

function aiConfidencePercent(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return null;
  return confidence <= 1 ? confidence * 100 : confidence;
}

function aiStatusMeta(status, current) {
  const effectiveStatus = status || {};
  const effectiveCurrent = current || {};
  const error = effectiveCurrent?.error || effectiveStatus?.error || effectiveStatus?.config_error || "";
  const running = Boolean(effectiveStatus.running);
  const source = String(effectiveCurrent.source_label || effectiveStatus.source_label || effectiveCurrent.source || effectiveStatus.source || "").toLowerCase();
  const hasDemoSource = source.includes("demo") || source.includes("replay") || source.includes("manual");
  const label = error ? "ERROR" : running && hasDemoSource ? "DEMO" : running ? "RUNNING" : effectiveStatus.ok ? "IDLE" : "—";
  const tone = error ? "error" : label === "RUNNING" ? "running" : label === "DEMO" ? "demo" : label === "IDLE" ? "idle" : "unknown";
  return { label, tone, error, running };
}

function aiSourceLabel(status, detection) {
  const source = String(detection?.source || status?.source_label || status?.source || status?.mode || "replay").toLowerCase();
  if (source.includes("manual")) return "Manual image";
  if (source.includes("replay") || source.includes("demo") || source.includes("single") || source.includes("loop")) return "Replay / Demo";
  return source.replace(/\b\w/g, (match) => match.toUpperCase()) || "Replay / Demo";
}

function formatSessionDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function cpuTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "neutral";
  if (n < 70) return "good";
  if (n <= 90) return "warn";
  return "bad";
}

function tempTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "neutral";
  if (n < 70) return "good";
  if (n <= 80) return "warn";
  return "bad";
}

function setMetricValue(id, text, tone) {
  const node = byId(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("is-good", "is-warn", "is-bad", "is-neutral", "is-online", "is-warning", "is-error", "is-muted");
  node.classList.add(`is-${tone || "neutral"}`);
}

function recentErrorEvents(events, limit = 5) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => String(event.severity || "").toLowerCase() === "error")
    .slice()
    .reverse()
    .slice(0, limit);
}

function detectionTypeMeta(type) {
  const value = String(type || "").toLowerCase();
  if (value.includes("boat") || value.includes("ship") || value.includes("vessel")) {
    return { label: "Barca", icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15h16l-2 3H6z"></path><path d="M7 15V9l5-3 5 3v6"></path><path d="M12 6v9"></path></svg>`, filter: "boat" };
  }
  if (value.includes("buoy") || value.includes("marker")) {
    return { label: "Boa", icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="11" r="5"></circle><path d="M12 16v5"></path></svg>`, filter: "buoy" };
  }
  if (value.includes("person") || value.includes("human")) {
    return { label: "Persona", icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="2.8"></circle><path d="M8 20c0-3 1.8-5.2 4-5.2s4 2.2 4 5.2"></path></svg>`, filter: "person" };
  }
  return { label: "Oggetto", icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`, filter: "object" };
}

function detectionSourceLabel(source) {
  const value = String(source || "").toUpperCase();
  if (value.includes("AI") || value.includes("INFERENCE")) return "AI";
  if (value.includes("RGB_LEFT")) return "RGB-L";
  if (value.includes("RGB_RIGHT")) return "RGB-R";
  if (value.includes("THERMAL")) return "THERMAL";
  if (value.includes("FUSION")) return "FUSION";
  return value || "--";
}

function detectionSourceBadge(item) {
  const source = String(item?.source || "").toLowerCase();
  const label = String(item?.source_label || item?.mode || item?.origin || "").toLowerCase();
  const imagePath = String(item?.image_path || item?.last_image || "").toLowerCase();
  const isAi = source.includes("ai") || source.includes("inference") || label.includes("replay") || imagePath.includes("/runtime/replay/");
  if (!isAi) return { label: detectionSourceLabel(item?.source), className: "badge-muted" };
  const isDemo = label.includes("demo") || label.includes("replay") || imagePath.includes("/runtime/replay/");
  return isDemo ? { label: "AI · DEMO", className: "badge-ai-demo" } : { label: "AI · LIVE", className: "badge-ai-live" };
}

function detectionConfidenceTone(confidence) {
  const value = aiConfidencePercent(confidence);
  if (!Number.isFinite(value)) return "muted";
  if (value >= 80) return "online";
  if (value >= 50) return "warning";
  return "error";
}

function detectionConfidenceLabel(confidence) {
  let value = Number(confidence);
  if (!Number.isFinite(value)) return "—";
  if (value <= 1) value *= 100;
  return `${Math.round(value)}%`;
}

function detectionDistanceLabel(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return "--";
  return `~${Math.round(value)}m`;
}

function detectionCoordinateLabel(item) {
  const box = item?.bbox || item?.box_xyxy || item?.xyxy;
  const normalized = normalizeBBox(box);
  if (normalized) return normalized.map((value) => Math.round(Number(value))).join(", ");
  const lat = item?.lat ?? item?.latitude;
  const lon = item?.lon ?? item?.lng ?? item?.longitude;
  if (lat == null || lon == null) return "—";
  const latDir = Number(lat) >= 0 ? "N" : "S";
  const lonDir = Number(lon) >= 0 ? "E" : "W";
  return `${Math.abs(Number(lat)).toFixed(4)} ${latDir}, ${Math.abs(Number(lon)).toFixed(4)} ${lonDir}`;
}

function detectionTimestampLabel(value) {
  return formatRomeTimeOnly(value);
}

function eventTypeMeta(type) {
  const detectionMeta = detectionTypeMeta(type);
  const raw = String(type || "");
  const label = raw.replace(/Detected$/i, " detected").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return { ...detectionMeta, label: label || detectionMeta.label || "Evento" };
}

function eventSeverityTone(severity) {
  const value = String(severity || "INFO").toLowerCase();
  if (["critical", "high", "medium", "low", "info"].includes(value)) return value;
  return "info";
}

function eventStatusTone(status) {
  const value = String(status || "NEW").toLowerCase();
  if (["new", "active", "resolved"].includes(value)) return value;
  return "new";
}

function eventSourceLabel(event) {
  return detectionSourceLabel(event?.source || event?.source_label || "unknown");
}

function eventUpdateLabel(event) {
  const count = Number(event?.update_count ?? event?.count ?? 0);
  const confidence = detectionConfidenceLabel(event?.last_confidence);
  const updates = Number.isFinite(count) && count > 0 ? `${count} update${count === 1 ? "" : "s"}` : "0 updates";
  return confidence === "—" ? updates : `${updates} · last conf ${confidence}`;
}

function sortEventsByLatest(events) {
  return (Array.isArray(events) ? events : []).slice().sort((left, right) => {
    const leftTs = parseDateValue(left?.updated_at || left?.last_timestamp || left?.created_at || left?.timestamp);
    const rightTs = parseDateValue(right?.updated_at || right?.last_timestamp || right?.created_at || right?.timestamp);
    return rightTs - leftTs;
  });
}
