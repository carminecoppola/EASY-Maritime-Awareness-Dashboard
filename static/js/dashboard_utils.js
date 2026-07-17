function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = value;
}

function setHtml(id, value) {
  const node = byId(id);
  if (node) node.innerHTML = value;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatAgeIt(epochSeconds) {
  if (!epochSeconds) return "--";
  const age = Math.max(0, Math.round(Date.now() / 1000 - epochSeconds));
  if (age < 1) return "ora";
  if (age < 60) return `${age}s fa`;
  const minutes = Math.floor(age / 60);
  if (minutes < 60) return `${minutes}m fa`;
  return `${Math.floor(minutes / 60)}h fa`;
}

function formatRomeDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function formatRomeTimeOnly(value) {
  if (!value) return "--";
  const date = new Date(Number(value) < 1e12 ? Number(value) * 1000 : value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function parseDateValue(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function romeDateParts(value) {
  const date = new Date(Number(value) < 1e12 ? Number(value) * 1000 : value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return parts;
}

function formatLogTimestamp(value) {
  const parts = romeDateParts(value);
  if (!parts) return "--";
  const now = romeDateParts(Date.now());
  if (parts.year === now.year && parts.month === now.month && parts.day === now.day) {
    return formatRomeTimeOnly(value);
  }
  const date = new Date(Number(value) < 1e12 ? Number(value) * 1000 : value);
  if (Number.isNaN(date.getTime())) return "--";
  const dtParts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${dtParts.day}/${dtParts.month} ${dtParts.hour}:${dtParts.minute}`;
}

function logDayKey(value) {
  const parts = romeDateParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatLogDayLabel(value) {
  const parts = romeDateParts(value);
  if (!parts) return "--";
  const today = romeDateParts(Date.now());
  const sameDay = parts.year === today.year && parts.month === today.month && parts.day === today.day;
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterday = romeDateParts(yesterdayDate);
  const sameYesterday = yesterday && parts.year === yesterday.year && parts.month === yesterday.month && parts.day === yesterday.day;
  const monthName = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", month: "long" })
    .format(new Date(Number(value) < 1e12 ? Number(value) * 1000 : value))
    .toLowerCase();
  const dayNumber = Number(parts.day);
  if (sameDay) return `Oggi, ${dayNumber} ${monthName}`;
  if (sameYesterday) return `Ieri, ${dayNumber} ${monthName}`;
  return `${dayNumber} ${monthName}`;
}

function isFreshTimestamp(value, maxAgeMs = 5000) {
  if (!value) return false;
  const ts = Number(value);
  if (!Number.isFinite(ts)) return false;
  const epochMs = ts < 1e12 ? ts * 1000 : ts;
  return Date.now() - epochMs <= maxAgeMs;
}

function formatUptime(seconds) {
  if (seconds == null) return "--";
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return days ? `${days}d ${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m ${secs}s`;
}

function formatUptimeShort(seconds) {
  if (seconds == null) return "--";
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function friendlySource(value) {
  const map = {
    SYSTEM: "Sistema",
    SYSTEM_ORCHESTRATOR: "System Orchestrator",
    UC512_MULTIPLEXER: "UC512",
    RGB_CAM_LEFT: "RGB LEFT",
    RGB_CAM_RIGHT: "RGB RIGHT",
    RGB_LEFT: "RGB LEFT",
    RGB_RIGHT: "RGB RIGHT",
    THERMAL_FLIR: "THERMAL",
    EASY_INFERENCE: "AI INFERENCE",
    DETECTION_MANAGER: "DETECTION MANAGER",
    EVENT_ENGINE: "EVENT ENGINE",
    SOURCE_MANAGER: "SOURCES",
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
}

function friendlySeverity(value) {
  const map = {
    info: "Info",
    warning: "Avviso",
    error: "Errore",
  };
  return map[String(value || "info").toLowerCase()] || "Info";
}

function friendlyEventType(value) {
  const map = {
    STARTUP: "Avvio",
    CONFIG: "Configurazione",
    STREAM_START: "Stream avviato",
    STREAM_STOP: "Stream fermo",
    STREAM_ERROR: "Errore stream",
    STREAM_RECOVERY: "Recupero stream",
    STREAM_AUTOSTART: "Auto avvio",
    SNAPSHOT_SAVED: "Snapshot salvato",
    SNAPSHOT_ERROR: "Errore snapshot",
    THERMAL_ANOMALY: "Allarme termico",
    THERMAL_HOTSPOT: "Hotspot termico",
    DETECTED: "Rilevato",
    NOT_DETECTED: "Non rilevato",
    INFERENCE_START: "AI avviata",
    INFERENCE_STOP: "AI fermata",
    INFERENCE_ERROR: "Errore AI",
    DETECTION_NEW: "Nuova detection",
    EVENT_CREATED: "Evento creato",
    EVENT_UPDATED: "Evento aggiornato",
    FEED_ENABLE: "Feed abilitato",
    FEED_DISABLE: "Feed sospeso",
    SOURCE_SELECT: "Sorgente selezionata",
    SOURCE_SELECT_FAILED: "Selezione fallita",
    SOURCE_REFRESH: "Aggiorna sorgenti",
    SOURCE_CHANGED: "Sorgente cambiata",
    DEVICE_STATE_CHANGED: "Stato device",
    CAMERA_CONNECTED: "Camera connessa",
    CAMERA_LOST: "Camera persa",
    THERMAL_CONNECTED: "Thermal connesso",
    THERMAL_OFFLINE: "Thermal offline",
    REPLAY_ACTIVE: "Replay attivo",
    REPLAY_IDLE: "Replay inattivo",
    SYSTEM_START: "Sistema avviato",
    SYSTEM_STOP: "Sistema fermato",
    SYSTEM_RESTART: "Sistema riavviato",
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
}

function sourceTone(state) {
  const value = String(state || "--").toUpperCase();
  if (["ONLINE", "STREAMING", "CONNECTED"].includes(value)) return { badge: "online", dot: "state-dot-online" };
  if (["INITIALIZING", "STARTING", "LOADING"].includes(value)) return { badge: "loading", dot: "state-dot-loading" };
  if (["WARNING", "WARN"].includes(value)) return { badge: "warning", dot: "state-dot-warning" };
  if (["OFFLINE", "ERROR", "FAILED", "DISCONNECTED", "DISABLED"].includes(value)) return { badge: "error", dot: "state-dot-error" };
  if (["NOT_AVAILABLE", "NOT_PRESENT", "UNKNOWN"].includes(value)) return { badge: "muted", dot: "state-dot-muted" };
  return { badge: "muted", dot: "state-dot-muted" };
}

function cleanLogText(value) {
  return String(value || "--")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function eventCategory(event) {
  const source = String(event?.source || "").toUpperCase();
  const type = String(event?.type || "").toUpperCase();
  if (type.includes("DETECTED") || type.includes("ANOMALY") || type.includes("HOTSPOT")) return "detection";
  if (type.includes("SNAPSHOT")) return "snapshot";
  if (source.includes("SYSTEM")) return "system";
  if (source.includes("THERMAL")) return "thermal";
  if (source.includes("DEVICE_MANAGER")) return "device";
  if (source.includes("RGB_CAM") || source.includes("UC512")) return "camera";
  return "other";
}

function logSourceKey(event) {
  const source = String(event?.source || "").toUpperCase();
  if (source.includes("SYSTEM")) return "system";
  if (source.includes("THERMAL")) return "thermal";
  if (source.includes("FRAME_PROVIDER")) return "frame_provider";
  if (source.includes("INFERENCE")) return "inference_worker";
  if (source.includes("RGB_CAM_LEFT") || source.includes("RGB_LEFT")) return "rgb_left";
  if (source.includes("RGB_CAM_RIGHT") || source.includes("RGB_RIGHT")) return "rgb_right";
  if (source.includes("UC512")) return "uc512";
  return "all";
}

function logSourceLabel(event) {
  const key = logSourceKey(event);
  const labels = {
    thermal: "THERMAL",
    rgb_left: "RGB LEFT",
    rgb_right: "RGB RIGHT",
    device: "DEVICE MANAGER",
    system: "SISTEMA",
    frame_provider: "FRAME PROVIDER",
    inference_worker: "INFERENCE",
    uc512: "UC512",
    all: "Tutte",
  };
  return labels[key] || "Tutte";
}

function logSourceClass(event) {
  const key = logSourceKey(event);
  return `log-source-${key}`;
}

function logLevelMeta(event) {
  const category = eventCategory(event);
  const severity = String(event?.severity || "info").toLowerCase();
  if (category === "detection") {
    return { label: "Rilevazione", tone: "online" };
  }
  if (severity === "error") return { label: "Errore", tone: "error" };
  if (severity === "warning") return { label: "Warning", tone: "warning" };
  return { label: "Info", tone: "muted" };
}

function logRowId(event) {
  return String(event?.id || `${event?.timestamp || ""}-${event?.source || ""}-${event?.type || ""}`).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function logVisibleText(event) {
  return cleanLogText(event?.description || event?.message || event?.type || "Evento");
}

function logExpandedText(event) {
  const message = cleanLogText(event?.description || event?.message || event?.type || "");
  const detail = cleanLogText(event?.meta?.detail || event?.meta?.message || "");
  const raw = cleanLogText(event?.meta?.raw_error || event?.meta?.raw || event?.error || "");
  const fragments = [];
  if (message) fragments.push(message);
  if (detail) fragments.push(detail);
  if (raw) fragments.push(`Raw error: ${raw}`);
  return fragments.length ? fragments.join("\n") : "Nessun dettaglio aggiuntivo disponibile.";
}

function logGroupKey(event) {
  const source = logSourceKey(event);
  const text = logVisibleText(event);
  return `${source}::${text}`;
}

function groupConsecutiveLogEvents(events) {
  const groups = [];
  (Array.isArray(events) ? events : []).forEach((event) => {
    const key = logGroupKey(event);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
      last.count += 1;
      return;
    }
    groups.push({
      key,
      id: logRowId(event),
      source: logSourceKey(event),
      sourceLabel: logSourceLabel(event),
      level: logLevelMeta(event),
      text: logVisibleText(event),
      firstTimestamp: event.timestamp,
      events: [event],
      count: 1,
    });
  });
  return groups;
}

function formatRomeCsvTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function showToast(title, message, tone = "info", actionUrl = "") {
  const stack = byId("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.innerHTML = `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
    ${actionUrl ? `<a href="${escapeHtml(actionUrl)}" target="_blank" rel="noreferrer">Open</a>` : ""}
  `;
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("toast-hide");
    window.setTimeout(() => toast.remove(), 250);
  }, 4200);
}

function setBadge(id, text, severity) {
  const node = byId(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("badge-muted", "badge-online", "badge-warning", "badge-error", "badge-loading");
  node.classList.add(`badge-${severity || "muted"}`);
}
