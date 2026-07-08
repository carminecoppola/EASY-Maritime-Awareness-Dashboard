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
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
}

function sourceTone(state) {
  const value = String(state || "--").toUpperCase();
  if (["ONLINE", "STREAMING"].includes(value)) return { badge: "online", dot: "state-dot-online" };
  if (["INITIALIZING", "STARTING", "LOADING"].includes(value)) return { badge: "loading", dot: "state-dot-loading" };
  if (["WARNING", "WARN"].includes(value)) return { badge: "warning", dot: "state-dot-warning" };
  if (["OFFLINE", "ERROR", "FAILED"].includes(value)) return { badge: "error", dot: "state-dot-error" };
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
  if (source.includes("THERMAL")) return "thermal";
  if (source.includes("RGB_CAM") || source.includes("UC512")) return "camera";
  if (source === "SYSTEM") return "system";
  return "other";
}

function logSourceKey(event) {
  const source = String(event?.source || "").toUpperCase();
  if (source.includes("THERMAL")) return "thermal";
  if (source.includes("RGB_CAM_LEFT") || source.includes("RGB_LEFT")) return "rgb_left";
  if (source.includes("RGB_CAM_RIGHT") || source.includes("RGB_RIGHT")) return "rgb_right";
  if (source.includes("UC512")) return "uc512";
  if (source === "SYSTEM") return "system";
  return "all";
}

function logSourceLabel(event) {
  const key = logSourceKey(event);
  const labels = {
    thermal: "THERMAL",
    rgb_left: "RGB LEFT",
    rgb_right: "RGB RIGHT",
    system: "SISTEMA",
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

function humanMissionState(health, thermal, rgb, operations) {
  const sensorHealth = operations?.sensor_health || {};
  const thermalOk = !thermal || (thermal.status !== "NOT_DETECTED" && thermal.status !== "DISABLED" && thermal.status !== "ERROR");
  const cameraFramesReady = Boolean(rgb?.has_frame);
  if (health?.ok && cameraFramesReady && thermalOk) {
    return {
      title: "System ready",
      copy: "All main sensors are online. You can monitor the feeds or capture snapshots.",
      helper: "If you only need to operate the system, start from the live camera and thermal pages. Diagnostics are only needed for faults.",
      nextTitle: "Monitor the live feeds",
      nextCopy: "Open the live camera page to confirm that RGB left, RGB right, and thermal are updating correctly.",
    };
  }
  if (!cameraFramesReady) {
    return {
      title: "Waiting for camera frames",
      copy: "The dashboard is online, but at least one RGB feed is not delivering frames yet.",
      helper: "Start from the live camera page. There you can reconnect the stream and verify whether both cameras are responding.",
      nextTitle: "Go to live cameras",
      nextCopy: "Open Acquisition and use reconnect on the feed that is still offline or not updating.",
    };
  }
  if (!thermalOk) {
    return {
      title: "Thermal unavailable",
      copy: "RGB feeds are available, but the thermal sensor is not ready yet.",
      helper: "You can keep using the RGB feeds, but thermal checks and anomaly confirmation are currently limited.",
      nextTitle: "Check thermal feed",
      nextCopy: "Open the thermal page to confirm whether the sensor is disconnected, disabled, or still starting up.",
    };
  }
  if ((sensorHealth.online_count || 0) < (sensorHealth.total_count || 3)) {
    return {
      title: "Needs attention",
      copy: "Some sensors are still coming online or need a quick check before normal operation.",
      helper: "Use the live pages first. Open diagnostics only if a sensor stays offline after a reconnect attempt.",
      nextTitle: "Check the affected sensor",
      nextCopy: "Open the page related to the offline sensor and confirm whether the issue is on RGB or thermal.",
    };
  }
  return {
    title: "Needs attention",
    copy: "The dashboard is up, but one or more operational elements still need a look.",
    helper: "Use the live monitoring pages first, then open diagnostics only if the issue remains unclear.",
    nextTitle: "Review live status",
    nextCopy: "Check the feeds and recent events to understand which block needs action first.",
  };
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

function stateTone(state) {
  const value = String(state || "--").toUpperCase();
  if (["ONLINE", "DETECTED", "READY", "OK", "STREAMING"].includes(value)) return { badge: "online", dot: "state-dot-online" };
  if (["BUSY", "WARNING", "WARN"].includes(value)) return { badge: "warning", dot: "state-dot-warning" };
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED"].includes(value)) return { badge: "error", dot: "state-dot-error" };
  if (["STARTING", "LOADING", "WAITING", "CHECKING", "INITIALIZING"].includes(value)) return { badge: "loading", dot: "state-dot-loading" };
  if (value === "PAUSED") return { badge: "muted", dot: "state-dot-muted" };
  if (["NOT_AVAILABLE", "UNKNOWN"].includes(value)) return { badge: "muted", dot: "state-dot-muted" };
  return { badge: "muted", dot: "state-dot-muted" };
}

function humanStateLabel(state) {
  const value = String(state || "--").toUpperCase();
  const map = {
    ONLINE: "Live",
    DETECTED: "Detected",
    READY: "Ready",
    OK: "Ready",
    BUSY: "Recovering",
    WARNING: "Needs check",
    WARN: "Needs check",
    OFFLINE: "Offline",
    ERROR: "Error",
    FAILED: "Error",
    DISABLED: "Disabled",
    STARTING: "Starting",
    LOADING: "Loading",
    WAITING: "Waiting",
    CHECKING: "Checking",
    INITIALIZING: "Initializing",
    PAUSED: "Paused",
    STREAMING: "Streaming",
    NOT_AVAILABLE: "Not available",
    UNKNOWN: "Unknown",
    REAL: "Live",
    MOCK: "Simulation",
    NOT_DETECTED: "Not detected",
    PENDING: "Starting",
  };
  return map[value] || (state || "--");
}

function liveFeedTone(state, feed, lastFrameTs = null, detected = true) {
  const value = String(state || "").toUpperCase();
  const fresh = isFreshTimestamp(lastFrameTs);
  if (["OFFLINE", "ERROR", "FAILED"].includes(value)) {
    return { dot: "state-dot-error", badge: "error", offline: true, loading: false };
  }
  if (["NOT_DETECTED", "DISABLED"].includes(value)) {
    return { dot: "state-dot-muted", badge: "muted", offline: true, loading: false };
  }
  if (["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING"].includes(value)) {
    return { dot: "state-dot-loading", badge: "loading", offline: false, loading: true };
  }
  if (["BUSY", "WARNING", "WARN"].includes(value)) {
    return { dot: "state-dot-warning", badge: "warning", offline: false, loading: false };
  }
  if (["ONLINE", "DETECTED", "READY", "OK", "REAL", "REALTIME", "MOCK", "LIVE"].includes(value) && fresh) {
    return { dot: "state-dot-online", badge: "online", offline: false, loading: false };
  }
  if (!fresh) {
    return { dot: detected ? "state-dot-error" : "state-dot-muted", badge: detected ? "error" : "muted", offline: true, loading: false };
  }
  return { dot: "state-dot-muted", badge: "muted", offline: false, loading: false };
}

function liveStatusText(feed, state, fps, lastFrameTs = null, detected = true) {
  const value = String(state || "").toUpperCase();
  const fresh = isFreshTimestamp(lastFrameTs);
  if (feed === "thermal") {
    if (["NOT_DETECTED", "DISABLED"].includes(value)) return "NON RILEVATO";
    if (["OFFLINE", "ERROR", "FAILED"].includes(value)) return "OFFLINE";
    if (!fresh) return detected ? "OFFLINE" : "NON RILEVATO";
    if (["STARTING", "LOADING", "WAITING", "CHECKING", "PENDING"].includes(value)) return "CARICANDO";
    if (value === "MOCK") return "SIMULAZIONE";
    return "REALE";
  }
  if (["NOT_DETECTED"].includes(value)) return "NON RILEVATO";
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED"].includes(value)) return "OFFLINE";
  if (!fresh) return detected ? "OFFLINE" : "NON RILEVATO";
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
  if (value === "BUSY" || value === "STARTING" || value === "WAITING" || value === "LOADING" || value === "CHECKING" || value === "PENDING") {
    return feed === "thermal"
      ? "The thermal feed is starting. Wait a moment, then check again before opening diagnostics."
      : "The camera is detected but not ready yet. Wait a moment, then try reconnect if the image does not appear.";
  }
  if (value === "OFFLINE" || value === "ERROR" || value === "FAILED" || value === "DISABLED" || value === "NOT_DETECTED") {
    return feed === "thermal"
      ? "Thermal preview is unavailable. Check the thermal page first, then diagnostics only if the sensor stays unavailable."
      : "This camera is not providing a usable feed right now. Try reconnect first, then open diagnostics only if it stays offline.";
  }
  return message || "Status is being updated.";
}

function humanFeedMessage(feed, state, message) {
  const value = String(state || "").toUpperCase();
  if (value === "ONLINE") {
    return feed === "thermal" ? "Thermal preview is updating." : "Live preview is updating.";
  }
  if (value === "BUSY") {
    return feed === "thermal" ? "The thermal sensor is trying to recover." : "The camera feed is trying to recover.";
  }
  if (value === "STARTING" || value === "WAITING" || value === "LOADING" || value === "CHECKING" || value === "PENDING") {
    return feed === "thermal" ? "The thermal sensor is starting up." : "The camera is detected and waiting for the first usable frame.";
  }
  if (value === "OFFLINE" || value === "ERROR" || value === "FAILED" || value === "NOT_DETECTED") {
    return feed === "thermal" ? "Thermal preview is unavailable right now." : "This camera is unavailable right now.";
  }
  if (value === "DISABLED" || value === "PAUSED") {
    return feed === "thermal" ? "Thermal preview is paused." : "This camera feed is paused.";
  }
  return message || "Status is being updated.";
}

function humanAcquisitionState(health, rgbLeft, rgbRight, thermal, pipeline) {
  const leftState = String(rgbLeft.state || health.rgb?.camera_state || "").toUpperCase();
  const rightState = String(rgbRight.state || health.rgb?.camera_state || "").toUpperCase();
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const rgbReady = leftState === "ONLINE" && rightState === "ONLINE";
  const thermalReady = !["ERROR", "FAILED", "OFFLINE", "NOT_DETECTED", "DISABLED"].includes(thermalState);

  if (health.ok && rgbReady && thermalReady) {
    return {
      title: "Live acquisition is ready",
      copy: "All primary feeds are available. Operators can confirm the previews and start saving snapshots immediately.",
      helper: "New users should stay on this page until they see all three feeds updating. Diagnostics are only needed if a reconnect does not recover the stream.",
      nextTitle: "Confirm the live previews",
      nextCopy: "Check left RGB, thermal, and right RGB in order. If all three are updating, you are ready to capture evidence.",
      controlState: pipeline.recording?.supported ? "Ready to capture" : "Ready",
    };
  }

  if (!rgbReady) {
    return {
      title: "One or more RGB feeds need recovery",
      copy: "At least one visible-light camera is not delivering a stable live image yet.",
      helper: "Use reconnect only on the blocked camera card below. If the image still does not return, then open diagnostics.",
      nextTitle: "Recover the affected RGB feed",
      nextCopy: "Look for the card marked offline, loading, or error, then use reconnect on that single stream.",
      controlState: "Action needed",
    };
  }

  if (!thermalReady) {
    return {
      title: "Thermal confirmation is still pending",
      copy: "RGB is available, but the thermal sensor is not fully ready for normal monitoring.",
      helper: "You can continue reviewing RGB feeds, but hotspot verification should wait until the thermal panel becomes stable.",
      nextTitle: "Validate the thermal panel",
      nextCopy: "Keep the thermal card in view and confirm the heatmap starts updating before escalating to system checks.",
      controlState: "Thermal check",
    };
  }

  return {
    title: "Acquisition needs a quick review",
    copy: "The page is live, but at least one component still needs operator confirmation before a full session starts.",
    helper: "Use the live cards below first. Move to advanced diagnostics only if the page cannot explain the problem clearly.",
    nextTitle: "Review the flagged source",
    nextCopy: "Use the status cards and operator overview to identify which stream or capture block still needs attention.",
    controlState: "Needs review",
  };
}

function humanThermalState(thermal, eventCount) {
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const available = !["ERROR", "FAILED", "OFFLINE", "NOT_DETECTED", "DISABLED"].includes(thermalState);

  if (available && thermal.anomaly_active) {
    return {
      title: "Thermal alarm requires confirmation",
      copy: "The thermal feed is live and an active hotspot or anomaly is being reported.",
      helper: "Keep this page open and validate the heatmap first. Use the event list to confirm whether the alarm is persistent or part of startup recovery noise.",
      nextTitle: "Confirm the hotspot on the heatmap",
      nextCopy: "If the alarm remains visible in the live image, review only the latest warning and error events for extra context.",
      eventsHelper: "Focus on warning, error, and anomaly events first. Informational entries are usually secondary while an alarm is active.",
    };
  }

  if (available) {
    return {
      title: "Thermal monitoring is stable",
      copy: "The heatmap is available and there is no active thermal alarm right now.",
      helper: "New users can trust this page as the main thermal check. Move to events only if you need historical context or want to confirm a recent alarm.",
      nextTitle: "Verify the live image is stable",
      nextCopy: "If the heatmap looks normal and the alarm card stays clear, scan only the latest thermal events before moving on.",
      eventsHelper: eventCount ? "Use filters when you need to narrow the timeline. Thermal and warning events are the most useful for quick verification." : "No events are recorded yet. If the heatmap is stable, there is nothing urgent to investigate.",
    };
  }

  return {
    title: "Thermal feed needs attention",
    copy: "The thermal sensor is not ready or is currently unavailable for reliable verification.",
    helper: "Use this page first to confirm whether the issue is only startup delay. If the feed stays unavailable, then escalate to system diagnostics.",
    nextTitle: "Wait briefly, then recheck the feed",
    nextCopy: "If the image does not recover and new thermal errors keep appearing, move to the system page for hardware or pipeline troubleshooting.",
    eventsHelper: "Prioritize thermal and system errors. They usually explain whether the issue is sensor startup, disconnect, or a broader pipeline fault.",
  };
}

function humanSystemState(health, eventsPayload) {
  const system = health.system || {};
  const operations = health.operations || {};
  const pipeline = operations.pipeline || {};
  const cameras = health.cameras || {};
  const rgbCams = cameras.rgb_cameras || [];
  const thermalCam = cameras.thermal_camera || {};
  const recentErrors = dashboardState.events.filter((event) => String(event.severity || "").toLowerCase() === "error").length;
  const cpu = Number(system.cpu_percent ?? 0);
  const ram = Number(system.ram?.percent ?? 0);
  const disk = Number(system.disk?.percent ?? 0);
  const temp = Number(system.cpu_temperature_c ?? 0);
  const cameraOnline = [rgbCams[0]?.enabled, rgbCams[1]?.enabled, thermalCam.state === "OFFLINE" ? false : true].filter(Boolean).length;
  const stressed = cpu >= 80 || ram >= 85 || disk >= 90 || temp >= 70;

  if (!stressed && health.ok && recentErrors === 0 && cameraOnline >= 3) {
    return {
      title: "System health looks stable",
      copy: "The Raspberry has enough headroom and the connected services are in a good state.",
      helper: "If a live feed still fails, the problem is likely local to that feed rather than the host itself.",
      nextTitle: "Check services and devices",
      nextCopy: "With resources stable, move to the service list and confirm whether anything is still paused or offline.",
      badge: "Stable",
    };
  }

  if (stressed) {
    return {
      title: "System resources need attention",
      copy: "One or more host metrics are high enough to affect live capture or recovery.",
      helper: "Deal with the host load first. High CPU, temperature, RAM, or disk pressure can make camera and thermal issues look worse than they are.",
      nextTitle: "Reduce host pressure",
      nextCopy: "Check the resource cards below and decide whether the Raspberry needs a reboot, cleanup, or a simpler workload.",
      badge: "Check load",
    };
  }

  if (recentErrors > 0) {
    return {
      title: "Recent errors deserve a quick review",
      copy: "The host is up, but the latest error log suggests one or more components still need confirmation.",
      helper: "Use the service and device sections first, then inspect the newest errors to see whether the issue is recurring.",
      nextTitle: "Inspect the latest error",
      nextCopy: "The newest red or warning event is usually the fastest way to identify the failing sensor or service.",
      badge: "Review errors",
    };
  }

  if ((cameraOnline || 0) < 3) {
    return {
      title: "One or more devices are offline",
      copy: "The host is running, but at least one connected camera or sensor is not yet available.",
      helper: "This usually means the fault is in the capture path, the cable, or the startup sequence rather than the OS itself.",
      nextTitle: "Confirm the offline device",
      nextCopy: "Use the device list below to identify which sensor is missing, then go back to the live page for that feed.",
      badge: "Devices missing",
    };
  }

  return {
    title: "System check complete",
    copy: "No clear host issue is visible yet, but the diagnostics page is ready if you need a second pass.",
    helper: "Keep this page for deeper investigation only. The live pages are still the best first stop for day-to-day operation.",
    nextTitle: "Return to live monitoring",
    nextCopy: "If everything is healthy, go back to acquisition or thermal view and keep the console focused on operations.",
    badge: "Ready",
  };
}

function updateCameraState(prefix, state, message) {
  const tone = stateTone(state);
  const label = humanStateLabel(state);
  const feedType = prefix.includes("thermal") ? "thermal" : "rgb";
  const uiMessage = humanFeedMessage(feedType, state, message);
  setBadge(`${prefix}_state`, label, tone.badge);
  setText(`${prefix}_state_copy`, label);
  setText(`${prefix}_state_msg`, uiMessage);
  setText(`${prefix}_quick_help`, buildFeedGuidance(feedType, state, message));
  const dot = byId(`${prefix}_dot`);
  if (dot) {
    dot.classList.remove("state-dot-muted", "state-dot-error", "state-dot-warning", "state-dot-online", "state-dot-loading");
    if (tone.dot) dot.classList.add(tone.dot);
  }
}

function renderKeyValueList(nodeId, items) {
  const node = byId(nodeId);
  if (!node) return;
  if (!items || !items.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>System status is being loaded</strong><p>More details will appear as soon as the dashboard receives live data.</p></div>`;
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `
        <div class="placeholder-item${item.tone ? ` placeholder-item-${item.tone}` : ""}">
          <strong>${escapeHtml(item.label)}</strong>
          <p>${escapeHtml(item.value)}</p>
        </div>
      `,
    )
    .join("");
}

function renderHealthSummary(nodeId, items) {
  const node = byId(nodeId);
  if (!node) return;
  if (!items || !items.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>System status is being loaded</strong><p>Health data will appear here once the current session is available.</p></div>`;
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `
        <div class="health-pill${item.tone ? ` health-pill-${item.tone}` : ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderSourcePanel(payload) {
  const grid = byId("sources-grid");
  const selectedBadge = byId("sources-selected-badge");
  if (!grid || !selectedBadge) return;
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const selected = payload?.selected_source || null;
  selectedBadge.textContent = selected?.name ? `Selected: ${selected.name}` : "Selected: --";

  if (!sources.length) {
    grid.innerHTML = `
      <div class="placeholder-item">
        <strong>No sources registered</strong>
        <p>The Source Manager will list Replay, RGB LEFT, RGB RIGHT and THERMAL here.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = sources
    .map((source) => {
      const tone = sourceTone(source.status);
      const label = humanStateLabel(source.status);
      const isSelected = Boolean(source.selected);
      const updated = source.last_update ? formatRomeDateTime(source.last_update) : "--";
      const configBits = [];
      if (source.type) configBits.push(source.type.replace(/_/g, " "));
      if (source.configuration?.replay_dir) configBits.push(compactPath(source.configuration.replay_dir));
      if (source.configuration?.provider) configBits.push(source.configuration.provider);
      const buttonLabel = isSelected ? "Selected" : "Select";
      return `
        <article class="source-card${isSelected ? " is-selected" : ""}">
          <div class="source-card-head">
            <div>
              <span class="source-card-name">${escapeHtml(source.name || source.id || "--")}</span>
              <p class="source-card-subtitle">${escapeHtml(configBits.join(" · ") || "No configuration")}</p>
            </div>
            <span class="badge badge-${tone.badge}">${escapeHtml(label)}</span>
          </div>
          <div class="source-card-body">
            <div class="source-status-line">
              <span class="state-dot ${tone.dot}"></span>
              <span>${escapeHtml(source.enabled ? "Enabled" : "Disabled")}</span>
            </div>
            <div class="source-card-meta">
              <span>Last update</span>
              <strong>${escapeHtml(updated)}</strong>
            </div>
            <div class="source-card-meta">
              <span>Type</span>
              <strong>${escapeHtml(source.type || "--")}</strong>
            </div>
          </div>
          <div class="source-card-actions">
            <button
              class="btn btn-small ${isSelected ? "btn-primary" : "btn-ghost"}"
              type="button"
              data-source-select="${escapeHtml(source.id || "")}"
              ${isSelected ? "disabled" : ""}
            >${escapeHtml(buttonLabel)}</button>
            ${isSelected ? '<span class="source-selected-badge">Current source</span>' : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMissionList(nodeId, items) {
  const node = byId(nodeId);
  if (!node) return;
  if (!items || !items.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>Nothing to show yet</strong><p>This section will fill up as the console learns more about the system.</p></div>`;
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `
        <div class="health-row">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <p>${escapeHtml(item.value)}</p>
          </div>
          <span class="badge ${item.tone === "error" ? "badge-error" : item.tone === "warn" ? "badge-warn" : item.tone === "muted" ? "badge-muted" : ""}">${escapeHtml(item.status)}</span>
        </div>
      `,
    )
    .join("");
}

function renderMissionDetections(nodeId, detections) {
  const node = byId(nodeId);
  if (!node) return;
  if (!detections || !detections.length) {
    node.innerHTML = `
      <div class="placeholder-item">
        <strong>No detections yet</strong>
        <p>The AI detection pipeline is not connected.</p>
      </div>
    `;
    return;
  }
  node.innerHTML = detections
    .map(
      (detection) => `
        <div class="placeholder-item">
          <strong>${escapeHtml(detection.label || "Detection")}</strong>
          <p>${escapeHtml(detection.message || detection.state || "No active detection data.")}</p>
          <small>${escapeHtml(detection.confidence ? `Confidence ${detection.confidence}` : "Preview only")}</small>
        </div>
      `,
    )
    .join("");
}

function formatAiBBox(box) {
  const normalized = normalizeBBox(box);
  if (!normalized) return "BBox: --";
  const [x1, y1, x2, y2] = normalized;
  if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) return "BBox: --";
  return `BBox: ${Math.round(x1)}, ${Math.round(y1)}, ${Math.round(x2)}, ${Math.round(y2)}`;
}

function normalizeBBox(box) {
  if (Array.isArray(box) && box.length === 4) {
    return box.map((value) => Number(value));
  }
  if (box && typeof box === "object") {
    return [box.x1, box.y1, box.x2, box.y2].map((value) => Number(value));
  }
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

function renderAiCompactStatus(status, current) {
  const node = byId("ai_status_compact");
  const dot = byId("ai_status_dot");
  const pill = byId("status-pill-ai");
  if (!node || !dot || !pill) return;
  const meta = aiStatusMeta(status, current);
  node.textContent = meta.label;
  pill.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
  dot.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
  pill.classList.add(`is-${meta.tone}`);
  dot.classList.add(`is-${meta.tone}`);
}

function aiSourceLabel(status, detection) {
  const source = String(detection?.source || status?.source_label || status?.source || status?.mode || "replay").toLowerCase();
  if (source.includes("manual")) return "Manual image";
  if (source.includes("replay") || source.includes("demo") || source.includes("single") || source.includes("loop")) return "Replay / Demo";
  return source.replace(/\b\w/g, (match) => match.toUpperCase()) || "Replay / Demo";
}

function aiSourceBadgeMeta(status, detection) {
  const label = aiSourceLabel(status, detection).toLowerCase();
  const source = String(detection?.source || status?.source_label || status?.source || "").toLowerCase();
  const isDemo = label.includes("demo") || label.includes("replay") || label.includes("manual") || source.includes("demo") || source.includes("replay");
  return isDemo ? { label: "AI · DEMO", className: "badge-ai-demo" } : { label: "AI · LIVE", className: "badge-ai-live" };
}

function renderAiDetections(status, current) {
  const list = byId("ai-detections-list");
  const empty = byId("ai-detections-empty");
  const countNode = byId("ai-preview-count");
  if (!list) return;
  const detections = Array.isArray(current?.last_detections)
    ? current.last_detections
    : Array.isArray(current?.detections)
      ? current.detections
      : Array.isArray(status?.last_detections)
        ? status.last_detections
        : [];

  list.innerHTML = "";
  if (countNode) countNode.textContent = `${detections.length}`;
  if (!detections.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  detections.slice(0, 6).forEach((detection) => {
    const card = document.createElement("article");
    card.className = "ai-detection-card";
    const confidence = aiConfidencePercent(detection?.confidence);
    const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "—";
    const confidenceDisplay = Number.isFinite(confidence) ? `${Math.round(confidence)}%` : confidenceLabel;
    const sourceLabel = aiSourceLabel(current || status, detection);
    const imagePath = current?.last_image || status?.last_image || detection?.image_path || "";
    card.innerHTML = `
      <strong>${escapeHtml(detection?.class_name || detection?.label || "Detection")}</strong>
      <p>${escapeHtml(formatAiBBox(detection?.box_xyxy || detection?.bbox || detection?.xyxy))}</p>
      <div class="ai-detection-meta">
        <span class="badge badge-online">Confidence ${escapeHtml(confidenceDisplay)}</span>
        <span class="badge badge-muted">Source ${escapeHtml(sourceLabel)}</span>
      </div>
      <small title="${escapeHtml(imagePath)}">${escapeHtml(compactPath(imagePath || detection?.source || "runtime/sessions"))}</small>
    `;
    list.appendChild(card);
  });
}

function renderAiPreview(status, current) {
  const panel = byId("ai-preview-panel");
  const img = byId("ai-preview-image");
  const empty = byId("ai-preview-empty");
  if (panel) panel.hidden = false;
  if (!img || !empty) return;
  const previewAvailable = Boolean((current && current.count > 0) || (status && status.count > 0) || status?.last_image || current?.last_image);
  const cacheKey = current?.updated_at || status?.updated_at || status?.last_run_ts || Date.now();
  if (!previewAvailable) {
    img.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  img.hidden = false;
  img.onload = () => {
    img.hidden = false;
    empty.hidden = true;
  };
  img.onerror = () => {
    img.hidden = true;
    empty.hidden = false;
  };
  img.src = `/api/inference/preview?ts=${encodeURIComponent(cacheKey)}`;
}

function renderAiPanel(status, current) {
  const effectiveStatus = status || {};
  const effectiveCurrent = current || {};
  const meta = aiStatusMeta(effectiveStatus, effectiveCurrent);
  const running = Boolean(effectiveStatus.running);
  const error = effectiveCurrent?.error || effectiveStatus?.error || effectiveStatus?.config_error || "";
  const state = meta.label;
  const badgeTone = error ? "error" : running ? "online" : "muted";
  const badgeNode = byId("ai-analysis-badge");
  if (badgeNode?.classList.contains("ai-control-state")) {
    badgeNode.textContent = state;
    badgeNode.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
    badgeNode.classList.add(`is-${meta.tone}`);
  } else {
    setBadge("ai-analysis-badge", state, badgeTone);
  }
  setText("ai-analysis-copy", running ? "AI inference worker is running." : error ? "AI inference worker reported a problem." : "AI inference worker is stopped.");
  setText("ai-analysis-helper", error || "The worker uses only runtime/ and can be started in Replay/Demo mode without touching the live cameras.");
  const modelName = String(effectiveStatus.model_path || "").split("/").pop() || "easy_v1_best_rgb.onnx";
  const backendName = "ONNX Runtime";
  const sourceLabel = effectiveStatus.source_label || "Replay / Demo";
  setText("ai-analysis-model", modelName);
  setText("ai-analysis-runtime", `${backendName} · Source: ${sourceLabel}`);
  setText("ai-analysis-last-image", `Last image: ${effectiveStatus.last_image ? String(effectiveStatus.last_image).split("/").pop() : "--"}`);
  const timing = `${effectiveStatus.last_inference_ms != null ? `${Number(effectiveStatus.last_inference_ms).toFixed(0)}ms` : "--"} · ${effectiveStatus.fps != null ? `${Number(effectiveStatus.fps).toFixed(1)} FPS` : "--"}`;
  setText(
    "ai-analysis-timing",
    running || effectiveStatus.last_inference_ms != null ? timing : "--",
  );
  renderAiControlButtons(effectiveStatus, effectiveCurrent);
  renderAiDetections(effectiveStatus, effectiveCurrent);
  renderAiPreview(effectiveStatus, effectiveCurrent);
}

function renderAiControlButtons(status, current) {
  const meta = aiStatusMeta(status, current);
  const startButton = byId("ai-start-button");
  const stopButton = byId("ai-stop-button");
  const runButton = byId("ai-run-demo-button");
  const refreshButton = byId("ai-refresh-button");
  if (!startButton && !stopButton && !runButton && !refreshButton) return;

  const isRunning = meta.label === "RUNNING";
  const isDemo = meta.label === "DEMO";
  if (startButton) startButton.hidden = isRunning || isDemo;
  if (stopButton) stopButton.hidden = !(isRunning || isDemo);
  if (runButton) runButton.hidden = !(isRunning);
  if (refreshButton) refreshButton.hidden = !(isRunning || isDemo);
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

function renderSessionPanel(status) {
  const payload = status || {};
  const session = payload.current || payload.session || null;
  const running = Boolean(payload.running || session?.status === "RUNNING");
  const metrics = session?.metrics || {};
  const title = byId("session-title");
  const helper = byId("session-helper");
  const startButton = byId("session-start-button");
  const stopButton = byId("session-stop-button");
  const statusNode = byId("session-status");

  if (title) title.textContent = session ? `Sessione ${session.session_id || "EASY"}` : "Nessuna sessione attiva";
  if (helper) {
    helper.textContent = session
      ? "Eventi, detection, metriche e archivi vengono salvati nella cartella runtime della sessione."
      : "Avvia una sessione per archiviare eventi, rilevazioni, metriche e futuri sviluppi EASY.";
  }
  if (startButton) startButton.hidden = running;
  if (stopButton) stopButton.hidden = !running;

  setText("session-id", session?.session_id || "—");
  setText("session-status", session?.status || "IDLE");
  setText("session-start-time", session?.start_time ? formatRomeTimeOnly(session.start_time) : "—");
  setText("session-duration", formatSessionDuration(metrics.session_duration ?? session?.duration));
  setText("session-model", session?.model_name || "—");
  setText("session-mode", session?.mode || "—");
  setText("session-total-detections", `${metrics.total_detections ?? 0}`);
  setText("session-total-events", `${metrics.total_events ?? 0}`);
  setText("session-active-events", `${metrics.active_events ?? 0}`);
  setText("session-boat-count", `${metrics.boat_count ?? 0}`);
  setText("session-ship-count", `${metrics.ship_count ?? 0}`);
  setText("session-buoy-count", `${metrics.buoy_count ?? 0}`);

  if (statusNode) {
    statusNode.classList.remove("is-running", "is-stopped");
    if (running) statusNode.classList.add("is-running");
    else if (session?.status === "STOPPED") statusNode.classList.add("is-stopped");
  }
}

function renderFrameSourcePanel(status) {
  const payload = status || {};
  const lastFrame = payload.last_frame || {};
  const sourceType = payload.source_type || payload.default_source_type || "UNKNOWN";
  const sourcePath = payload.source_path || payload.default_source_path || "—";
  const totalFrames = payload.total_frames;
  const frameIndex = lastFrame.frame_index ?? payload.current_frame_index;
  const state = payload.error ? "ERROR" : payload.ok === false ? "DEGRADED" : "READY";

  setText("frame-source-type", sourceType);
  setText("frame-source-path", sourcePath ? compactPath(String(sourcePath)) : "—");
  setText("frame-source-status", state);
  setText("frame-current-id", lastFrame.frame_id || payload.current_frame_id || "—");
  setText("frame-current-index", frameIndex == null ? "—" : `${frameIndex}`);
  setText("frame-total-frames", totalFrames == null ? "—" : `${totalFrames}`);

  const helper = byId("frame-source-helper");
  if (helper) {
    helper.textContent = payload.error
      ? payload.error
      : `Source ${sourceType} pronto. Il frame corrente verra' inoltrato all'inference worker con metadata unificati.`;
  }
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

function renderSystemDevices(items, onlineCount = 0, totalCount = 3) {
  const node = byId("device-list");
  const countNode = byId("system-device-count");
  if (!node) return;
  node.innerHTML = "";
  if (countNode) countNode.textContent = `${onlineCount}/${totalCount}`;
  (items || []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "system-device-row";
    row.innerHTML = `
      <div class="system-device-main">
        <strong class="system-device-name">${escapeHtml(item.name)}</strong>
        <span class="system-device-desc">${escapeHtml(item.desc)}</span>
      </div>
      <span class="badge badge-${item.tone || "muted"} system-device-state">${escapeHtml(item.state)}</span>
    `;
    node.appendChild(row);
  });
}

function renderSystemErrors(events) {
  const list = byId("recent-errors-list");
  const empty = byId("system-errors-empty");
  if (!list) return;
  list.innerHTML = "";
  const items = (Array.isArray(events) ? events : []).slice(0, 5);
  if (!items.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  items.forEach((event) => {
    const row = document.createElement("div");
    row.className = "system-error-row";
    row.innerHTML = `
      <span class="log-row-time">${escapeHtml(formatRomeTimeOnly(event.timestamp))}</span>
      <span class="badge ${logSourceClass(event)}">${escapeHtml(logSourceLabel(event))}</span>
      <div class="system-error-main">
        <strong class="system-error-title">${escapeHtml(cleanLogText(event.description || event.message || event.type || "Errore"))}</strong>
      </div>
      <span class="badge badge-error">${escapeHtml(logLevelMeta(event).label)}</span>
    `;
    list.appendChild(row);
  });
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
    return {
      label: "Barca",
      icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15h16l-2 3H6z"></path><path d="M7 15V9l5-3 5 3v6"></path><path d="M12 6v9"></path></svg>`,
      filter: "boat",
    };
  }
  if (value.includes("buoy") || value.includes("marker")) {
    return {
      label: "Boa",
      icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="11" r="5"></circle><path d="M12 16v5"></path></svg>`,
      filter: "buoy",
    };
  }
  if (value.includes("person") || value.includes("human")) {
    return {
      label: "Persona",
      icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="2.8"></circle><path d="M8 20c0-3 1.8-5.2 4-5.2s4 2.2 4 5.2"></path></svg>`,
      filter: "person",
    };
  }
  return {
    label: "Oggetto",
    icon: `<svg class="detection-type-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`,
    filter: "object",
  };
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
  if (!isAi) {
    return { label: detectionSourceLabel(item?.source), className: "badge-muted" };
  }
  const isDemo = label.includes("demo") || label.includes("replay") || imagePath.includes("/runtime/replay/");
  return isDemo ? { label: "AI · DEMO", className: "badge-ai-demo" } : { label: "AI · LIVE", className: "badge-ai-live" };
}

function detectionConfidenceTone(confidence) {
  const value = aiConfidencePercent(confidence);
  if (!Number.isFinite(value)) return "muted";
  if (value > 80) return "online";
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
  if (normalized) {
    return normalized.map((value) => Math.round(Number(value))).join(", ");
  }
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
  const label = raw
    .replace(/Detected$/i, " detected")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return {
    ...detectionMeta,
    label: label || detectionMeta.label || "Evento",
  };
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

function renderCurrentEventsPanel() {
  const grid = byId("current-events-grid");
  const empty = byId("current-events-empty-state");
  const badge = byId("events-count-badge");
  if (!grid) return;
  const events = sortEventsByLatest(dashboardState.currentEvents);
  if (badge) badge.textContent = `${events.length} eventi`;
  grid.innerHTML = "";
  grid.hidden = !events.length;
  if (empty) empty.hidden = events.length > 0;
  events.forEach((event) => {
    const typeMeta = eventTypeMeta(event?.type);
    const severityTone = eventSeverityTone(event?.severity);
    const statusTone = eventStatusTone(event?.status);
    const card = document.createElement("article");
    card.className = `event-card is-${severityTone}`;
    card.innerHTML = `
      <div class="event-card-head">
        <span class="event-card-title">${typeMeta.icon}<span>${escapeHtml(typeMeta.label)}</span></span>
        <span class="badge badge-severity-${severityTone}">${escapeHtml(String(event?.severity || "INFO"))}</span>
      </div>
      <div class="event-card-meta">
        <span class="badge badge-status-${statusTone}">${escapeHtml(String(event?.status || "NEW"))}</span>
        <span class="badge badge-muted">${escapeHtml(eventSourceLabel(event))}</span>
      </div>
      <div class="event-card-times">
        <span>Created ${escapeHtml(formatRomeTimeOnly(event?.created_at || event?.timestamp))}</span>
        <span>Updated ${escapeHtml(formatRomeTimeOnly(event?.updated_at || event?.last_timestamp))}</span>
      </div>
      <div class="event-card-updates">${escapeHtml(eventUpdateLabel(event))}</div>
    `;
    grid.appendChild(card);
  });
}

function renderEventTimeline() {
  const timeline = byId("events-timeline");
  const empty = byId("events-timeline-empty-state");
  if (!timeline) return;
  const events = sortEventsByLatest(dashboardState.eventHistory);
  timeline.innerHTML = "";
  timeline.hidden = !events.length;
  if (empty) empty.hidden = events.length > 0;
  events.forEach((event) => {
    const typeMeta = eventTypeMeta(event?.type);
    const severityTone = eventSeverityTone(event?.severity);
    const statusTone = eventStatusTone(event?.status);
    const row = document.createElement("article");
    row.className = "timeline-row";
    row.innerHTML = `
      <span class="timeline-time">${escapeHtml(formatRomeTimeOnly(event?.updated_at || event?.created_at || event?.timestamp))}</span>
      <div class="timeline-main">
        <strong>${escapeHtml(typeMeta.label)}</strong>
        <p>${escapeHtml(eventSourceLabel(event))} · ${escapeHtml(eventUpdateLabel(event))}</p>
      </div>
      <span class="badge badge-severity-${severityTone}">${escapeHtml(String(event?.severity || "INFO"))}</span>
      <span class="badge badge-status-${statusTone}">${escapeHtml(String(event?.status || "NEW"))}</span>
    `;
    timeline.appendChild(row);
  });
}

function renderDetectionsPage(health) {
  const container = byId("detections-table-body");
  const tableShell = byId("detections-table-shell");
  const emptyState = byId("detections-empty-state");
  const badge = byId("detections-count-badge");
  const totalNode = byId("detections-total-count");
  const avgNode = byId("detections-avg-confidence");
  const latestNode = byId("detections-latest-time");
  const detections = Array.isArray(dashboardState.detections)
    ? dashboardState.detections
    : Array.isArray(health?.operations?.detections)
      ? health.operations.detections
      : [];
  const currentAi = dashboardState.inferenceCurrent || {};
  const aiDetections = Array.isArray(currentAi.last_detections)
    ? currentAi.last_detections
    : Array.isArray(currentAi.detections)
      ? currentAi.detections
      : [];
  const mappedAiDetections = aiDetections.map((item) => ({
    ...item,
    label: item.class_name || item.label || "AI",
    type: item.class_name || item.label || "AI",
    bbox: item.box_xyxy || item.bbox,
    source: "ai_inference",
    source_label: currentAi.source_label || currentAi.source || "Replay / Demo",
    image_path: currentAi.last_image || currentAi.image_path || "",
    timestamp: currentAi.last_run_ts || currentAi.updated_at,
  }));
  const hasAiInOperations = detections.some((item) => String(item?.source || "").toLowerCase().includes("ai"));
  const mergedDetections = hasAiInOperations ? detections : [...mappedAiDetections, ...detections];
  const liveDetections = mergedDetections.filter((item) => {
    const source = String(item?.source || "").toLowerCase();
    const label = String(item?.label || "").toLowerCase();
    return source !== "placeholder" && !label.includes("no detections yet");
  });
  const filter = dashboardState.filters.detection || "all";
  const filtered = liveDetections.filter((item) => {
    const meta = detectionTypeMeta(item?.type || item?.label || item?.category || "");
    return filter === "all" || meta.filter === filter;
  });

  if (container) {
    container.innerHTML = "";
    if (filtered.length) {
      if (tableShell) tableShell.hidden = false;
      filtered.forEach((item) => {
        const meta = detectionTypeMeta(item?.type || item?.label || item?.category || "");
        const sourceBadge = detectionSourceBadge(item);
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>
            <span class="detection-type">${meta.icon}<span>${escapeHtml(meta.label)}</span></span>
          </td>
          <td><span class="detection-coordinate">${escapeHtml(detectionCoordinateLabel(item))}</span></td>
          <td>${escapeHtml(detectionDistanceLabel(item?.distance_m ?? item?.distance))}</td>
          <td><span class="badge badge-${detectionConfidenceTone(item?.confidence)} detection-confidence">${escapeHtml(detectionConfidenceLabel(item?.confidence))}</span></td>
          <td><span class="detection-time">${escapeHtml(detectionTimestampLabel(item?.timestamp || item?.created || item?.ts))}</span></td>
          <td><span class="badge ${escapeHtml(sourceBadge.className)} detection-source">${escapeHtml(sourceBadge.label)}</span></td>
        `;
        container.appendChild(row);
      });
    } else {
      if (tableShell) tableShell.hidden = true;
    }
  }

  const totalCount = liveDetections.length;
  const confidenceValues = liveDetections
    .map((item) => aiConfidencePercent(item?.confidence))
    .filter((value) => Number.isFinite(value));
  const avgConfidence = confidenceValues.length ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) : null;
  const latest = liveDetections[0] || null;

  if (badge) badge.textContent = `${totalCount} oggetti`;
  if (totalNode) totalNode.textContent = `${totalCount}`;
  if (avgNode) avgNode.textContent = avgConfidence == null ? "—" : `${avgConfidence}%`;
  if (latestNode) latestNode.textContent = latest ? detectionTimestampLabel(latest.timestamp || latest.created || latest.ts) : "—";

  if (emptyState) {
    emptyState.hidden = totalCount > 0 && filtered.length > 0;
  }
}

function renderEventLog(events) {
  const list = byId("log-list");
  if (!list) return;
  const emptyState = byId("log-empty-state");
  const loadMoreButton = byId("log-load-more");
  const visibleEvents = (Array.isArray(events) ? events : []).slice(0, dashboardState.logLimit);
  const filtered = getVisibleLogEvents(events);
  const grouped = groupConsecutiveLogEvents(filtered);

  list.innerHTML = "";
  if (emptyState) {
    emptyState.hidden = filtered.length > 0;
    emptyState.textContent = visibleEvents.length ? "Nessun evento corrisponde ai filtri attivi." : "Nessun evento registrato in questa sessione.";
  }

  let lastDayKey = "";
  grouped.forEach((group) => {
    const dayKey = logDayKey(group.firstTimestamp);
    if (dayKey && dayKey !== lastDayKey) {
      const divider = document.createElement("div");
      divider.className = "log-day-divider";
      divider.textContent = formatLogDayLabel(group.firstTimestamp);
      list.appendChild(divider);
      lastDayKey = dayKey;
    }
    const expanded = dashboardState.logExpandedIds?.has(group.id);
    const row = document.createElement("div");
    row.className = `log-entry${expanded ? " is-expanded" : ""}`;
    row.innerHTML = `
      <button class="log-row" type="button" data-log-row="${escapeHtml(group.id)}" aria-expanded="${expanded ? "true" : "false"}">
        <span class="log-row-time">${escapeHtml(formatLogTimestamp(group.firstTimestamp))}</span>
        <span class="log-row-source ${logSourceClass(group.events[0])}">${escapeHtml(group.sourceLabel)}</span>
        <span class="log-row-event">${escapeHtml(group.text || friendlyEventType(group.events[0].type) || "Evento")}</span>
        ${group.count > 1 ? `<span class="badge badge-warning log-row-count">×${group.count}</span>` : ""}
        <span class="badge badge-${group.level.tone} log-row-level">${escapeHtml(group.level.label)}</span>
      </button>
      <div class="log-row-detail" data-log-detail="${escapeHtml(group.id)}" ${expanded ? "" : "hidden"}>
        <div class="log-group-children">
          ${group.events
            .map((event) => {
              const level = logLevelMeta(event);
              return `
                <div class="log-row log-row-child" role="presentation">
                  <span class="log-row-time">${escapeHtml(formatLogTimestamp(event.timestamp))}</span>
                  <span class="log-row-source ${logSourceClass(event)}">${escapeHtml(logSourceLabel(event))}</span>
                  <span class="log-row-event">${escapeHtml(logVisibleText(event) || friendlyEventType(event.type) || "Evento")}</span>
                  <span class="badge badge-${level.tone} log-row-level">${escapeHtml(level.label)}</span>
                </div>
                <p class="log-row-detail-text">${escapeHtml(logExpandedText(event))}</p>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
    const toggle = () => {
      if (!dashboardState.logExpandedIds) dashboardState.logExpandedIds = new Set();
      if (dashboardState.logExpandedIds.has(group.id)) {
        dashboardState.logExpandedIds.delete(group.id);
      } else {
        dashboardState.logExpandedIds.add(group.id);
      }
      renderEventLog(events);
    };
    row.querySelector("[data-log-row]")?.addEventListener("click", toggle);
    list.appendChild(row);
  });

  if (loadMoreButton) {
    loadMoreButton.hidden = visibleEvents.length >= (Array.isArray(events) ? events.length : 0);
    loadMoreButton.disabled = visibleEvents.length >= (Array.isArray(events) ? events.length : 0);
  }

  const summary = (dashboardState.eventSummary || {}).severity || {};
  const countAll = dashboardState.eventCount ?? events.length;
  const countError = summary.error ?? events.filter((event) => String(event.severity || "").toLowerCase() === "error").length;
  const countInfo = summary.info ?? events.filter((event) => String(event.severity || "").toLowerCase() === "info").length;
  const countWarning = summary.warning ?? events.filter((event) => String(event.severity || "").toLowerCase() === "warning").length;
  const countDetection = events.filter((event) => eventCategory(event) === "detection").length;

  setText("log-count-all", `${countAll}`);
  setText("log-count-error", `${countError}`);
  setText("log-count-info", `${countInfo}`);
  setText("log-count-warning", `${countWarning}`);
  setText("log-count-detection", `${countDetection}`);
}

function getVisibleLogEvents(events) {
  const visibleEvents = (Array.isArray(events) ? events : []).slice(0, dashboardState.logLimit);
  const filters = dashboardState.filters || {};
  const query = String(filters.logQuery || "").trim().toLowerCase();
  const selectedSeverity = String(filters.logSeverity || "all").toLowerCase();
  const selectedSource = String(filters.logSource || "all").toLowerCase();
  return visibleEvents.filter((event) => {
    const severity = String(event.severity || "info").toLowerCase();
    const category = eventCategory(event);
    const sourceKey = logSourceKey(event);
    const haystack = [
      event.timestamp,
      event.source,
      event.type,
      event.description,
      event.action,
      event.meta?.detail,
      event.meta?.message,
      event.meta?.raw_error,
      event.error,
    ]
      .map((value) => String(value || ""))
      .join(" ")
      .toLowerCase();
    const matchesSeverity =
      selectedSeverity === "all" ||
      (selectedSeverity === "detection" ? category === "detection" : severity === selectedSeverity);
    const matchesSource = selectedSource === "all" || sourceKey === selectedSource;
    const matchesQuery = !query || haystack.includes(query);
    return matchesSeverity && matchesSource && matchesQuery;
  });
}

function renderSnapshots(snapshots, summary) {
  const grid = byId("snapshot-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!snapshots.length) {
    grid.innerHTML = `<div class="empty-state">No snapshots captured in this session.</div>`;
  }
  snapshots.forEach((item) => {
    const card = document.createElement("article");
    card.className = `snapshot-card snapshot-card-${item.feed || "generic"}`;
    const feedLabel = item.feed_label || item.feed || "--";
    const feedClass = item.feed === "thermal" ? "is-thermal" : "is-rgb";
    const openIcon = `<svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7"></path><path d="M13 3 6 10"></path><path d="M4 5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1"></path></svg>`;
    const downloadIcon = `<svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7"></path><path d="m5.2 7.8 2.8 2.8 2.8-2.8"></path><path d="M3 13.5h10"></path></svg>`;
    card.innerHTML = `
      <div class="snapshot-media">
        <a class="snapshot-image-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
          <img class="snapshot-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(feedLabel)} snapshot" loading="lazy">
        </a>
        <div class="snapshot-overlay">
          <span class="snapshot-feed ${feedClass}">${escapeHtml(feedLabel)}</span>
          <span class="snapshot-age">${escapeHtml(formatRomeDateTime(item.created))}</span>
        </div>
        <div class="snapshot-fallback" hidden>
          <strong>Preview not available</strong>
          <p>The file exists, but the browser could not display the thumbnail.</p>
        </div>
      </div>
      <div class="snapshot-card-body">
        <div class="snapshot-card-head">
          <div>
            <strong title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</strong>
          </div>
        </div>
        <p class="snapshot-meta-line">${escapeHtml(formatBytes(item.size_bytes))} · Roma ${escapeHtml(formatRomeDateTime(item.created))}</p>
        <p class="snapshot-path" title="${escapeHtml(item.path || "")}">${escapeHtml(item.path || "")}</p>
        <div class="button-row snapshot-actions">
          <a class="btn btn-secondary btn-small btn-icon" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${openIcon}<span>Open preview</span></a>
          <a class="btn btn-ghost btn-small btn-icon" href="${escapeHtml(item.download_url)}" download="${escapeHtml(item.filename)}">${downloadIcon}<span>Download file</span></a>
        </div>
      </div>
    `;
    const img = card.querySelector(".snapshot-image");
    const fallback = card.querySelector(".snapshot-fallback");
    if (img && fallback) {
      img.addEventListener("error", () => {
        img.hidden = true;
        fallback.hidden = false;
      });
      img.addEventListener("load", () => {
        img.hidden = false;
        fallback.hidden = true;
      });
    }
    grid.appendChild(card);
  });
  const count = summary?.count ?? snapshots.length;
  setText("snapshot-count", `${count}`);
  setText("snapshot-total-size", formatBytes(summary?.size_bytes || 0));
  const latest = summary?.latest || snapshots[0];
  const latestLabel = latest ? `Roma ${formatRomeDateTime(latest.created)}` : "--";
  setText("snapshot-latest-time", latestLabel);
  setText("snapshots-header-count", `${count}`);
  setText("snapshots-header-latest", latest ? latest.feed_label || latest.feed || "--" : "--");
  setText("snapshots-header-size", formatBytes(summary?.size_bytes || 0));
}

function humanSnapshotState(snapshots, summary) {
  const count = summary?.count ?? snapshots.length;
  const latest = summary?.latest || snapshots[0];
  if (!count) {
    return {
      title: "No snapshots yet",
      copy: "The archive is empty for this session. Save a capture from acquisition to populate the list.",
      helper: "When the first file arrives, you can open it here without leaving the dashboard.",
      nextTitle: "Capture a snapshot from acquisition",
      nextCopy: "Use the live feeds to save the first useful frame, then return here to confirm it landed in storage.",
      badge: "Empty",
    };
  }
  return {
    title: `${count} snapshots available`,
    copy: latest ? `The newest item came from ${latest.feed_label || latest.feed || "the selected feed"}.` : "The archive has been populated during this session.",
    helper: "Open the latest item first, then scan the older captures only if you need to compare history or verify a repeated issue.",
    nextTitle: latest ? `Open ${latest.feed_label || latest.feed || "the latest capture"} first` : "Open the latest capture first",
    nextCopy: latest
      ? `The newest file usually confirms whether ${latest.feed_label || latest.feed || "the feed"} saved correctly and whether the image looks usable.`
      : "The latest file is usually the quickest check that the pipeline saved correctly.",
    badge: count > 5 ? "Archive growing" : "Ready",
  };
}

function renderLivePage(health) {
  const operations = health.operations || {};
  const sensorHealth = operations.sensor_health || {};
  const rgb = health.rgb || {};
  const thermal = health.thermal || {};
  const cameras = health.cameras || {};
  const rgbCams = cameras.rgb_cameras || [];
  const rgbLeft = rgbCams[0] || {};
  const rgbRight = rgbCams[1] || {};
  const thermalCam = cameras.thermal_camera || {};

  const liveCards = [
    {
      key: "rgb_left",
      state: rgbLeft.state || rgb.camera_state || "LOADING",
      fps: rgbLeft.fps ?? rgb.fps ?? null,
      last: rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgb.last_acquisition_ts || null,
      device: rgbLeft.hardware_name || "Arducam UC-517 LEFT",
      detected: Boolean(rgbLeft.last_acquisition_ts || rgb.last_frame_ts),
    },
    {
      key: "thermal",
      state: thermal.status || thermalCam.state || thermal.mode || "LOADING",
      fps: thermal.fps ?? thermal.frame_rate ?? thermalCam.fps ?? null,
      last: thermal.last_frame_ts || thermal.last_acquisition_ts || thermalCam.last_frame_ts || null,
      device: "FLIR Lepton",
      detected: Boolean(thermal.last_frame_ts || thermal.last_acquisition_ts || thermalCam.last_frame_ts),
      mode: thermal.mode || thermalCam.mode || "real",
    },
    {
      key: "rgb_right",
      state: rgbRight.state || rgb.camera_state || "LOADING",
      fps: rgbRight.fps ?? rgb.fps ?? null,
      last: rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts || null,
      device: rgbRight.hardware_name || "Arducam UC-517 RIGHT",
      detected: Boolean(rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts),
    },
  ];

  liveCards.forEach((cardInfo) => {
    const tone = liveFeedTone(cardInfo.state, cardInfo.key, cardInfo.last, cardInfo.detected);
    if (cardInfo.key === "thermal" && !isFreshTimestamp(cardInfo.last)) {
      tone.offline = true;
      tone.loading = false;
      tone.dot = cardInfo.detected ? "state-dot-error" : "state-dot-muted";
      tone.badge = cardInfo.detected ? "error" : "muted";
    }
    const label = tone.offline ? (cardInfo.detected ? "Offline" : "Not detected") : humanStateLabel(cardInfo.state);
    const statusText = liveStatusText(cardInfo.key, cardInfo.state, cardInfo.fps, cardInfo.last, cardInfo.detected);
    const card = document.querySelector(`[data-feed="${cardInfo.key}"]`);
    const badgeTone = tone.badge === "loading" ? "loading" : tone.badge;
    setBadge(`${cardInfo.key}_state`, label, badgeTone);
    setText(`${cardInfo.key}_status`, statusText);
    setText(`${cardInfo.key}_fps`, cardInfo.fps != null && Number.isFinite(Number(cardInfo.fps)) ? `${Number(cardInfo.fps).toFixed(1)} fps` : "--");
    setText(`${cardInfo.key}_last`, cardInfo.last ? formatRomeTimeOnly(cardInfo.last) : "--");
    const offlineNode = byId(`${cardInfo.key}_offline`);
    const offline = tone.offline;
    if (card) {
      card.classList.toggle("is-offline", offline);
      card.classList.toggle("is-loading", tone.loading);
      card.classList.toggle("is-live", !offline && !tone.loading);
    }
    if (offlineNode) {
      offlineNode.hidden = !offline;
    }
    const deviceNode = byId(`${cardInfo.key}_device_name`);
    if (deviceNode) deviceNode.textContent = cardInfo.device;
    const image = card ? card.querySelector("[data-feed-image], #thermal-frame") : null;
    if (image) {
      image.classList.toggle("is-hidden", offline);
    }
  });

  const recording = operations.pipeline?.recording || {};
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const snapshotButton = byId("live-snapshot-button");
  if (snapshotButton) {
    snapshotButton.dataset.primaryFeed = thermalState === "REAL" || thermalState === "LIVE" || thermalState === "READY" ? "thermal" : "rgb_left";
  }
  const recordButton = byId("live-record-button");
  if (recordButton) {
    const supported = Boolean(recording.supported);
    recordButton.disabled = !supported;
    recordButton.title = supported ? "" : "Recording non disponibile";
  }
}

function renderSensorsPage(health, snapshots) {
  const operations = health.operations || {};
  const sensorHealth = operations.sensor_health || {};
  const pipeline = operations.pipeline || {};
  const rgb = health.rgb || {};
  const thermal = health.thermal || {};
  const rgbCams = health.cameras?.rgb_cameras || [];
  const rgbLeft = rgbCams[0] || {};
  const rgbRight = rgbCams[1] || {};
  const acquisitionState = humanAcquisitionState(health, rgbLeft, rgbRight, thermal, pipeline);
  const rgbLeftLabel = humanStateLabel(rgbLeft.state || rgb.camera_state || "Loading");
  const rgbRightLabel = humanStateLabel(rgbRight.state || rgb.camera_state || "Loading");
  const thermalLabel = humanStateLabel(thermal.status || thermal.mode || "Loading");
  const recordingLabel = pipeline.recording?.supported ? humanStateLabel(pipeline.recording?.state || "READY") : "Planned";

  setText("sensors-header-streams", `${sensorHealth.online_count ?? 0}/${sensorHealth.total_count ?? 3} online`);
  setText("sensors-header-snapshots", `${snapshots.length}`);
  setText("sensors-header-recording", recordingLabel);
  setText("sensors-header-errors", `${(dashboardState.events || []).filter((event) => String(event.severity || "").toLowerCase() === "error").length}`);
  setText("acq-hero-title", acquisitionState.title);
  setText("acq-hero-copy", acquisitionState.copy);
  setText("acq-hero-helper", acquisitionState.helper);
  setText("acq-next-step-title", acquisitionState.nextTitle);
  setText("acq-next-step-copy", acquisitionState.nextCopy);
  setText("acq-rgb-left-state", rgbLeftLabel);
  setText("acq-rgb-left-meta", `${rgbLeft.fps != null ? `${Number(rgbLeft.fps).toFixed(1)} fps` : "No live FPS yet"} · ${buildFeedGuidance("rgb", rgbLeft.state || rgb.camera_state, rgbLeft.message || rgb.message || "Waiting for camera frames. Check that the stream is running.")}`);
  setText("acq-rgb-right-state", rgbRightLabel);
  setText("acq-rgb-right-meta", `${rgbRight.fps != null ? `${Number(rgbRight.fps).toFixed(1)} fps` : "No live FPS yet"} · ${buildFeedGuidance("rgb", rgbRight.state || rgb.camera_state, rgbRight.message || rgb.message || "Waiting for camera frames. Check that the stream is running.")}`);
  setText("acq-thermal-state", thermalLabel);
  setText("acq-thermal-meta", buildFeedGuidance("thermal", thermal.status || thermal.mode, thermal.message || "Thermal status is being loaded"));
  setText("acq-recording-state", recordingLabel);
  setText("acq-recording-meta", pipeline.recording?.supported ? (pipeline.recording?.message || "Recording controls are available from this page.") : "Recording workflow is visible here and will connect to the Raspberry pipeline next.");
  setText("acq-control-state", acquisitionState.controlState);
  renderHealthSummary("acquisition-health", [
    { label: "Left RGB", value: `${rgbLeftLabel} · ${buildFeedGuidance("rgb", rgbLeft.state || rgb.camera_state, rgbLeft.message || "Waiting for camera frames. Check that the stream is running.")}`, tone: rgbLeft.enabled ? "muted" : "error" },
    { label: "Right RGB", value: `${rgbRightLabel} · ${buildFeedGuidance("rgb", rgbRight.state || rgb.camera_state, rgbRight.message || "Waiting for camera frames. Check that the stream is running.")}`, tone: rgbRight.enabled ? "muted" : "error" },
    { label: "Thermal", value: `${thermalLabel} · ${buildFeedGuidance("thermal", thermal.status || thermal.mode, thermal.message || "Thermal status is being loaded")}`, tone: thermal.anomaly_active ? "warn" : "muted" },
    { label: "Capture workflow", value: pipeline.recording?.supported ? (pipeline.recording?.message || recordingLabel) : "Planned for Raspberry pipeline integration", tone: pipeline.recording?.supported ? "muted" : "warn" },
  ]);
  const errors = dashboardState.events.filter((event) => String(event.severity || "").toLowerCase() === "error").slice(0, 4);
  renderKeyValueList(
    "acq-error-list",
    errors.length
      ? errors.map((event) => ({
          label: `${friendlySource(event.source)} · ${friendlyEventType(event.type)}`,
          value: cleanLogText(event.description || event.action || "Error"),
          tone: "error",
        }))
      : [{ label: "No acquisition errors", value: "All stream-related checks are currently clear.", tone: "muted" }],
  );
}

function renderThermalPage(health, eventsPayload) {
  const thermal = health.thermal || {};
  const thermalState = humanThermalState(thermal, eventsPayload?.count ?? dashboardState.events.length);
  const thermalLabel = humanStateLabel(thermal.status || thermal.mode || "Loading");
  const summary = [thermal.min_c, thermal.avg_c, thermal.max_c].map((item) => (item == null ? "Not available" : `${item} °C`)).join(" / ");
  setText("thermal-hero-title", thermalState.title);
  setText("thermal-hero-copy", thermalState.copy);
  setText("thermal-hero-helper", thermalState.helper);
  setText("thermal-events-helper", thermalState.eventsHelper);
  setText("thermal-page-state", thermalLabel);
  setText("thermal-page-metrics", summary);
  setText("thermal-page-alarm", thermal.anomaly_active ? "Active" : "Clear");
  setText("thermal-page-events", `${eventsPayload?.count ?? dashboardState.events.length}`);
  setText("thermal-alarm-reason", thermal.message || (thermal.anomaly_active ? "Thermal anomaly detected." : "Thermal feed nominal."));
  setText("thermal_state", thermalLabel);
  setText("thermal_state_copy", thermalLabel);
  setText("thermal_state_msg", humanFeedMessage("thermal", thermal.status || thermal.mode, thermal.message || "Thermal status is being loaded"));
  setText("thermal_quick_help", buildFeedGuidance("thermal", thermal.status || thermal.mode, thermal.message || "Thermal status is being loaded"));
  setText("thermal_min", thermal.min_c != null ? `${thermal.min_c} ${thermal.unit === "raw" ? "raw" : "°C"}` : thermal.raw_min != null ? `${thermal.raw_min} raw` : "Not available");
  setText("thermal_avg", thermal.avg_c != null ? `${thermal.avg_c} ${thermal.unit === "raw" ? "raw" : "°C"}` : thermal.raw_avg != null ? `${thermal.raw_avg} raw` : "Not available");
  const thermalMaxNode = byId("thermal_max");
  setText("thermal_max", thermal.max_c != null ? `${thermal.max_c} ${thermal.unit === "raw" ? "raw" : "°C"}` : thermal.raw_max != null ? `${thermal.raw_max} raw` : "Not available");
  setText("thermal_anomaly", thermal.anomaly_active ? "Active" : "Clear");
  if (thermalMaxNode) {
    thermalMaxNode.classList.remove("thermal-max-low", "thermal-max-warning", "thermal-max-danger");
    const rawMax = Number(thermal.raw_max ?? thermal.max_raw ?? (thermal.unit === "raw" ? thermal.max_c : NaN));
    if (Number.isFinite(rawMax)) {
      if (rawMax < 4000) thermalMaxNode.classList.add("thermal-max-low");
      else if (rawMax <= 4400) thermalMaxNode.classList.add("thermal-max-warning");
      else thermalMaxNode.classList.add("thermal-max-danger");
    }
  }
  const sparklineNode = byId("thermal-sparkline");
  const samples = Array.isArray(thermal.history) ? thermal.history : Array.isArray(thermal.samples) ? thermal.samples : [];
  if (sparklineNode) {
    sparklineNode.innerHTML = "";
    if (samples.length) {
      const values = samples.map((sample) => Number(sample?.value ?? sample?.max ?? sample ?? 0)).filter((value) => Number.isFinite(value));
      if (values.length) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        sparklineNode.hidden = false;
        sparklineNode.innerHTML = values
          .slice(-30)
          .map((value) => {
            const ratio = max === min ? 0.5 : (value - min) / (max - min);
            return `<span style="height:${Math.max(16, Math.round(100 * ratio))}%"></span>`;
          })
          .join("");
      } else {
        sparklineNode.hidden = true;
      }
    } else {
      sparklineNode.hidden = true;
    }
  }
}

function renderSystemPage(health) {
  const system = health.system || {};
  const cameras = health.cameras || {};
  const operations = health.operations || {};
  const sensorHealth = operations.sensor_health || {};
  const rgbCams = cameras.rgb_cameras || [];
  const thermalCam = cameras.thermal_camera || {};
  const uc512 = cameras.uc512_multiplexer || {};
  const rgbLeftLive = sensorHealth.rgb_left || {};
  const rgbRightLive = sensorHealth.rgb_right || {};
  const thermalLive = sensorHealth.thermal || {};
  const cpu = Number(system.cpu_percent ?? 0);
  const ram = Number(system.ram?.percent ?? 0);
  const disk = Number(system.disk?.percent ?? 0);
  const temp = Number(system.cpu_temperature_c ?? 0);
  const uptime = formatUptimeShort(system.uptime_seconds);
  setMetricValue("cpu-percent", `${cpu.toFixed(1)}%`, cpuTone(cpu));
  setMetricValue("ram-percent", `${ram.toFixed(1)}%`, cpuTone(ram));
  setMetricValue("disk-percent", `${disk.toFixed(1)}%`, cpuTone(disk));
  setMetricValue("cpu-temp", temp ? `${temp.toFixed(1)}°C` : "--", tempTone(temp));
  setMetricValue("uptime", uptime, "neutral");

  const devices = [
    { name: "UC512_MULTIPLEXER", desc: "Arducam CamArray UC-512", state: uc512.state || "UNKNOWN", tone: stateTone(uc512.state).badge },
    { name: "RGB_CAM_LEFT", desc: `Arducam UC-517 LEFT · ${rgbCams[0]?.fps != null ? `${Number(rgbCams[0].fps).toFixed(1)} fps` : "-- fps"}`, state: rgbLeftLive.state || "NOT_DETECTED", tone: stateTone(rgbLeftLive.state).badge },
    { name: "RGB_CAM_RIGHT", desc: `Arducam UC-517 RIGHT · ${rgbCams[1]?.fps != null ? `${Number(rgbCams[1].fps).toFixed(1)} fps` : "-- fps"}`, state: rgbRightLive.state || "NOT_DETECTED", tone: stateTone(rgbRightLive.state).badge },
    { name: "THERMAL_FLIR", desc: `FLIR/Lepton · ${thermalCam.mode || "real"}`, state: thermalLive.state || "NOT_DETECTED", tone: stateTone(thermalLive.state).badge },
    { name: "Sensors online", desc: `${sensorHealth.online_count ?? 0}/3`, state: sensorHealth.online_count != null && sensorHealth.online_count > 0 ? "DETECTED" : "NOT_DETECTED", tone: stateTone(sensorHealth.online_count > 0 ? "ONLINE" : "NOT_DETECTED").badge },
  ];
  renderSystemDevices(devices, sensorHealth.online_count ?? 0, sensorHealth.total_count ?? 3);

  const recentErrors = recentErrorEvents(dashboardState.events, 5);
  renderSystemErrors(recentErrors);
}

function updateNavIndicators(health, eventsPayload, snapshots) {
  const sensorHealth = health?.operations?.sensor_health || {};
  const detections = Array.isArray(dashboardState.detections)
    ? dashboardState.detections.filter((item) => String(item?.source || "").toLowerCase() !== "placeholder")
    : [];
  const errorCount = eventsPayload?.summary?.severity?.error || 0;
  const detectionsErrors = detections.filter((item) => String(item?.severity || "").toLowerCase() === "error").length;
  document.querySelectorAll("[data-nav-key]").forEach((link) => {
    const key = link.getAttribute("data-nav-key");
    const badge = link.querySelector(".nav-alert-badge");
    if (badge) {
      const showBadge = (key === "log" || key === "system") && errorCount > 0;
      badge.hidden = !showBadge;
      badge.classList.remove("is-online", "is-warning", "is-error", "is-muted");
      if (showBadge) {
        badge.classList.add("is-error");
        badge.textContent = `${errorCount} err`;
      } else {
        badge.textContent = "";
      }
    }
  });
}

function reloadThermalFrame() {
  const node = byId("thermal-frame");
  if (node) node.src = `/thermal/frame?ts=${Date.now()}`;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, { cache: "no-store", ...options });
    let data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error };
  }
}

async function streamControl(feed, action) {
  const response = await fetch(`/video/${feed}/${action}`, { method: "POST" });
  return response.json();
}

async function snapshot(feed) {
  const labels = {
    rgb_left: "RGB LEFT",
    rgb_right: "RGB RIGHT",
    thermal: "THERMAL",
  };
  if (dashboardState.page === "live" && feed === "thermal") {
    return;
  }
  const overlay = byId(`overlay-${feed}`);
  if (overlay) {
    overlay.textContent = "Saving snapshot...";
    overlay.classList.remove("feed-overlay-hidden");
  }
  try {
    const response = await fetch(`/snapshot/${feed}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Snapshot failed");
    await refreshDashboard();
    showToast("Snapshot saved", `${labels[feed] || feed}: ${payload.filename}`, "success", payload.url);
    if (overlay) {
      overlay.textContent = "Snapshot saved";
      window.setTimeout(() => setFeedOverlay(feed, false, ""), 1500);
    }
  } catch (error) {
    console.error(error);
    showToast("Snapshot failed", `${labels[feed] || feed}: ${error.message || "unknown error"}`, "error");
    if (overlay) overlay.textContent = error.message || "Snapshot failed";
  }
}

async function callInferenceAction(path, body = null) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
  }
  return payload;
}

function setFeedOverlay(feed, visible, message) {
  if (dashboardState.page === "live" && feed === "thermal") return;
  const overlay = byId(`overlay-${feed}`);
  if (!overlay) return;
  overlay.textContent = visible ? humanFeedMessage(feed === "thermal" ? "thermal" : "rgb", feed === "thermal" ? byId("thermal_state")?.textContent : byId(`${feed}_state`)?.textContent, message) : (message || "");
  overlay.classList.toggle("feed-overlay-hidden", !visible);
  overlay.classList.toggle("is-actionable", Boolean(visible && message));
}

const dashboardState = {
  page: document.body?.dataset?.page || "live",
  liteMode: new URLSearchParams(window.location.search).has("lite"),
  health: null,
  events: [],
  currentEvents: [],
  eventHistory: [],
  detections: [],
  inferenceStatus: null,
  inferenceCurrent: null,
  frameProviderStatus: null,
  sessionStatus: null,
  snapshots: [],
  snapshotSummary: null,
  sources: null,
  eventSummary: null,
  eventCount: 0,
  logLimit: 100,
  logExpandedIds: new Set(),
  initialLogSeverity: new URLSearchParams(window.location.search).get("severity") || "error",
  filters: {
    severity: "all",
    source: "all",
    query: "",
    detection: "all",
    logSeverity: new URLSearchParams(window.location.search).get("severity") || "error",
    logSource: "all",
    logQuery: "",
  },
};

async function refreshDashboard() {
  try {
    const [healthRes, eventsRes, snapshotsRes, sourcesRes, inferenceStatusRes, inferenceCurrentRes, sessionStatusRes, currentEventsRes, eventHistoryRes, frameProviderRes] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/events?limit=9999"),
      fetchJson("/api/snapshots/recent?limit=12"),
      fetchJson("/api/sources/status"),
      fetchJson("/api/inference/status"),
      fetchJson("/api/detection/current"),
      fetchJson("/api/session/status"),
      fetchJson("/api/events/current"),
      fetchJson("/api/events/history"),
      fetchJson("/api/frame-provider/status"),
    ]);
    const health = healthRes.data || dashboardState.health || {};
    const eventsPayload = eventsRes.data || { events: [], summary: {} };
    const snapshotsPayload = snapshotsRes.data || { items: [], summary: null };
    const sourcesPayload = sourcesRes.data || { sources: [] };
    const inferenceStatus = inferenceStatusRes.data || {};
    const inferenceCurrent = inferenceCurrentRes.data || {};
    const sessionStatus = sessionStatusRes.data || health.session || {};
    const currentEvents = currentEventsRes.data || { events: [] };
    const eventHistory = eventHistoryRes.data || { events: [] };
    const frameProviderStatus = frameProviderRes.data || inferenceStatus?.frame_provider || {};

    dashboardState.health = health;
    dashboardState.events = eventsPayload?.events || [];
    dashboardState.currentEvents = currentEvents?.events || [];
    dashboardState.eventHistory = eventHistory?.events || [];
    dashboardState.eventSummary = eventsPayload?.summary || null;
    dashboardState.eventCount = eventsPayload?.count ?? dashboardState.events.length;
    dashboardState.detections = health.operations?.detections || [];
    dashboardState.inferenceStatus = inferenceStatus;
    dashboardState.inferenceCurrent = inferenceCurrent;
    dashboardState.frameProviderStatus = frameProviderStatus;
    dashboardState.sessionStatus = sessionStatus;
    dashboardState.snapshots = snapshotsPayload?.items || [];
    dashboardState.snapshotSummary = snapshotsPayload?.summary || null;
    dashboardState.sources = sourcesPayload || null;

    const rgb = health.rgb || {};
    const thermal = health.thermal || {};
    const cameras = health.cameras || {};
    const rgbCams = cameras.rgb_cameras || [];
    const rgbLeft = rgbCams[0] || {};
    const rgbRight = rgbCams[1] || {};
    const thermalCam = cameras.thermal_camera || {};
    const operations = health.operations || {};
    const pipeline = operations.pipeline || {};

    setText("timestamp", formatRomeDateTime(health.timestamp));
    setText("system-state", health.ok ? "READY" : "DEGRADED");
    setText("summary-sensors-online", `${operations.sensor_health?.online_count ?? 0}/${operations.sensor_health?.total_count ?? 3}`);
    setText("summary-sensors-detail", health.ok ? "System ready" : "Needs attention");
    setText("summary-thermal", thermal.status || thermal.mode || "Not available");
    setText("summary-thermal-detail", thermal.message || "Thermal status is being loaded");
    setText("summary-snapshots", `${dashboardState.snapshots.length}`);
    setText("summary-snapshots-detail", dashboardState.snapshots.length ? `${dashboardState.snapshots[0].feed_label || dashboardState.snapshots[0].feed} · ${formatAgeIt(dashboardState.snapshots[0].created_ts)}` : "No snapshots captured in this session");
    setText("summary-events", `${eventsPayload?.count ?? dashboardState.events.length}`);
    setText("summary-events-detail", eventsPayload?.count ? "Recent activity feed" : "No events recorded in this session");
    setText("summary-recording", pipeline.recording?.state || "Not connected");
    setText("summary-recording-detail", pipeline.recording?.message || "Recording controls are available from Acquisition");

    updateCameraState("rgb_left", rgbLeft.state || rgb.camera_state || "DETECTED", rgbLeft.message || rgb.message || "Ready");
    updateCameraState("rgb_right", rgbRight.state || rgb.camera_state || "DETECTED", rgbRight.message || rgb.message || "Ready");
    updateCameraState("thermal", thermal.status || thermalCam.state || "--", thermal.message || thermalCam.status?.message || "Thermal feed ready");

    setText("rgb_left_fps", rgbLeft.fps != null ? `${Number(rgbLeft.fps).toFixed(1)} fps` : "Loading");
    setText("rgb_right_fps", rgbRight.fps != null ? `${Number(rgbRight.fps).toFixed(1)} fps` : "Loading");
    setText("rgb_left_last", rgbLeft.last_acquisition_ts || rgb.last_frame_ts ? formatAgeIt(rgbLeft.last_acquisition_ts || rgb.last_frame_ts) : "No frames yet");
    setText("rgb_right_last", rgbRight.last_acquisition_ts || rgb.last_frame_ts ? formatAgeIt(rgbRight.last_acquisition_ts || rgb.last_frame_ts) : "No frames yet");
    setText("rgb_left_error", rgbLeft.error || rgb.error || "None");
    setText("rgb_right_error", rgbRight.error || rgb.error || "None");

    const thermalUnit = thermal.unit === "raw" ? "raw" : "°C";
    setText("thermal_min", thermal.min_c != null ? `${thermal.min_c} ${thermalUnit}` : thermal.raw_min != null ? `${thermal.raw_min} raw` : "Not available");
    setText("thermal_avg", thermal.avg_c != null ? `${thermal.avg_c} ${thermalUnit}` : thermal.raw_avg != null ? `${thermal.raw_avg} raw` : "Not available");
    setText("thermal_max", thermal.max_c != null ? `${thermal.max_c} ${thermalUnit}` : thermal.raw_max != null ? `${thermal.raw_max} raw` : "Not available");
    setText("thermal_anomaly", thermal.hotspot_percent != null ? `${thermal.hotspot_percent}%` : thermal.anomaly_active ? "Active" : "Clear");

    renderEventLog(dashboardState.events);
    renderSnapshots(dashboardState.snapshots, dashboardState.snapshotSummary);
    renderSourcePanel(dashboardState.sources);
    updateNavIndicators(health, eventsPayload, dashboardState.snapshots);

    if (dashboardState.page === "live") {
      renderLivePage(health);
      renderAiCompactStatus(inferenceStatus, inferenceCurrent);
    }
    if (dashboardState.page === "detections") {
      renderFrameSourcePanel(frameProviderStatus);
      renderCurrentEventsPanel();
      renderEventTimeline();
      renderDetectionsPage(health);
      renderAiPanel(inferenceStatus, inferenceCurrent);
      renderSessionPanel(sessionStatus);
    }
    if (dashboardState.page === "system") {
      renderSystemPage(health);
    }

    renderKeyValueList(
      "acq-error-list",
      dashboardState.events
        .filter((event) => String(event.severity || "").toLowerCase() === "error")
        .slice(0, 4)
        .map((event) => ({
          label: `${friendlySource(event.source)} · ${friendlyEventType(event.type)}`,
          value: cleanLogText(event.description || event.action || "Error"),
          tone: "error",
        })),
    );

  } catch (error) {
    console.error(error);
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  }
}

function setupFilters() {
  const searchInput = byId("log-search");
  if (searchInput) {
    searchInput.value = "";
    searchInput.addEventListener("input", (event) => {
      dashboardState.filters.logQuery = String(event.target.value || "").trim().toLowerCase();
      renderEventLog(dashboardState.events);
    });
  }

  const sourceSelect = byId("log-source-select");
  if (sourceSelect) {
    sourceSelect.addEventListener("change", (event) => {
      dashboardState.filters.logSource = String(event.target.value || "all").toLowerCase();
      renderEventLog(dashboardState.events);
    });
  }

  document.querySelectorAll("[data-log-severity]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.logSeverity = button.getAttribute("data-log-severity") || "all";
      document.querySelectorAll("[data-log-severity]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderEventLog(dashboardState.events);
    });
  });

  const initialSeverity = dashboardState.initialLogSeverity || "error";
  const initialButton = document.querySelector(`[data-log-severity="${initialSeverity}"]`);
  if (initialButton) {
    document.querySelectorAll("[data-log-severity]").forEach((item) => item.classList.remove("is-active"));
    initialButton.classList.add("is-active");
  }

  document.querySelectorAll("[data-detection-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.detection = button.getAttribute("data-detection-filter") || "all";
      document.querySelectorAll("[data-detection-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      if (dashboardState.page === "detections") {
        renderDetectionsPage(dashboardState.health || {});
      }
    });
  });

  const loadMore = byId("log-load-more");
  if (loadMore) {
    loadMore.addEventListener("click", () => {
      dashboardState.logLimit += 100;
      renderEventLog(dashboardState.events);
    });
  }
}

function setupButtons() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-source-select]");
    if (!button) return;
    const sourceId = button.getAttribute("data-source-select");
    if (!sourceId) return;
    button.disabled = true;
    try {
      const payload = await callInferenceAction("/api/sources/select", { source_id: sourceId });
      const selectedName = payload?.selected_source?.name || sourceId;
      showToast("Source changed", `${selectedName} selected`, "success");
      await refreshDashboard();
    } catch (error) {
      console.error(error);
      showToast("Source selection failed", error.message || "Unable to select source", "error");
    } finally {
      button.disabled = false;
    }
  });

  const sourcesRefreshButton = byId("sources-refresh-button");
  if (sourcesRefreshButton) {
    sourcesRefreshButton.addEventListener("click", async () => {
      sourcesRefreshButton.disabled = true;
      try {
        await callInferenceAction("/api/sources/refresh", {});
        showToast("Sources refreshed", "The source registry was updated.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Refresh failed", error.message || "Unable to refresh sources", "error");
      } finally {
        sourcesRefreshButton.disabled = false;
      }
    });
  }

  const logExportButton = byId("log-export-csv");
  if (logExportButton) {
    logExportButton.addEventListener("click", () => {
      const visibleEvents = getVisibleLogEvents(dashboardState.events);
      const csvRows = [
        ["timestamp", "sorgente", "evento", "livello", "dettaglio"],
        ...visibleEvents.map((event) => {
          const detail = logExpandedText(event).replace(/\n/g, " | ");
          return [
            event.timestamp || "",
            logSourceLabel(event),
            cleanLogText(event.description || event.message || event.type || ""),
            logLevelMeta(event).label,
            detail,
          ];
        }),
      ];
      const csv = csvRows
        .map((row) =>
          row
            .map((cell) => {
              const value = String(cell ?? "");
              const escaped = value.replaceAll('"', '""');
              return `"${escaped}"`;
            })
            .join(","),
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `easy-maritime-log-${formatRomeCsvTimestamp()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const liveSnapshotButton = byId("live-snapshot-button");
  if (liveSnapshotButton) {
    liveSnapshotButton.addEventListener("click", async () => {
      const health = dashboardState.health || {};
      const thermal = health.thermal || {};
      const rgb = health.rgb || {};
      const cameras = health.cameras || {};
      const rgbCams = cameras.rgb_cameras || [];
      const rgbLeft = rgbCams[0] || {};
      const rgbRight = rgbCams[1] || {};
      const thermalState = String(thermal.mode || thermal.status || "").toUpperCase();
      const preferredFeed =
        thermalState === "REAL" || thermalState === "LIVE" || thermalState === "READY"
          ? "thermal"
          : rgbLeft.state && !String(rgbLeft.state).toUpperCase().includes("OFFLINE")
            ? "rgb_left"
            : rgbRight.state && !String(rgbRight.state).toUpperCase().includes("OFFLINE")
              ? "rgb_right"
              : "thermal";
      await snapshot(preferredFeed);
    });
  }

  const liveRecordButton = byId("live-record-button");
  if (liveRecordButton) {
    liveRecordButton.addEventListener("click", () => {
      const recording = dashboardState.health?.operations?.pipeline?.recording || {};
      if (recording.supported) {
        showToast("Recording", "Recording actions are not wired in this phase.", "info");
      } else {
        liveRecordButton.disabled = true;
      }
    });
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const feed = button.getAttribute("data-feed");
      const action = button.getAttribute("data-action");
      try {
        await streamControl(feed, action);
        if (action === "start") reloadThermalFrame();
        await refreshDashboard();
      } catch (error) {
        console.error(error);
      }
    });
  });

  document.querySelectorAll("[data-snapshot]").forEach((button) => {
    button.addEventListener("click", async () => {
      const feed = button.getAttribute("data-snapshot");
      await snapshot(feed);
    });
  });

  const thermalButton = byId("thermal-snapshot");
  if (thermalButton) {
    thermalButton.addEventListener("click", async () => {
      await snapshot("thermal");
    });
  }

  const aiStartButton = byId("ai-start-button");
  if (aiStartButton) {
    aiStartButton.addEventListener("click", async () => {
      aiStartButton.disabled = true;
      try {
        await callInferenceAction("/api/inference/start", { mode: "replay" });
        showToast("AI started", "Replay/Demo inference is now running.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("AI start failed", error.message || "Unable to start AI worker", "error");
      } finally {
        aiStartButton.disabled = false;
      }
    });
  }

  const aiStopButton = byId("ai-stop-button");
  if (aiStopButton) {
    aiStopButton.addEventListener("click", async () => {
      aiStopButton.disabled = true;
      try {
        await callInferenceAction("/api/inference/stop");
        showToast("AI stopped", "Replay/Demo inference has been stopped.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("AI stop failed", error.message || "Unable to stop AI worker", "error");
      } finally {
        aiStopButton.disabled = false;
      }
    });
  }

  const aiRunButton = byId("ai-run-demo-button");
  if (aiRunButton) {
    aiRunButton.addEventListener("click", async () => {
      aiRunButton.disabled = true;
      try {
        await callInferenceAction("/api/inference/run-on-image", {});
        showToast("AI demo run", "The worker processed the next demo image.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Demo run failed", error.message || "Unable to run demo inference", "error");
      } finally {
        aiRunButton.disabled = false;
      }
    });
  }

  const aiRefreshButton = byId("ai-refresh-button");
  if (aiRefreshButton) {
    aiRefreshButton.addEventListener("click", async () => {
      aiRefreshButton.disabled = true;
      try {
        await refreshDashboard();
        showToast("Detections refreshed", "AI status and detections were updated.", "success");
      } catch (error) {
        console.error(error);
        showToast("Refresh failed", error.message || "Unable to refresh AI detections", "error");
      } finally {
        aiRefreshButton.disabled = false;
      }
    });
  }

  const frameProviderConfigureButton = byId("frame-provider-configure-button");
  if (frameProviderConfigureButton) {
    frameProviderConfigureButton.addEventListener("click", async () => {
      frameProviderConfigureButton.disabled = true;
      try {
        await callInferenceAction("/api/frame-provider/configure", {
          source_type: "REPLAY_FOLDER",
          source_path: "runtime/replay/test_inference",
          loop: true,
          save_temp_frames: false,
        });
        showToast("Frame source configured", "Replay folder provider is now configured on runtime/replay/test_inference.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Configure failed", error.message || "Unable to configure frame provider", "error");
      } finally {
        frameProviderConfigureButton.disabled = false;
      }
    });
  }

  const frameProviderNextButton = byId("frame-provider-next-button");
  if (frameProviderNextButton) {
    frameProviderNextButton.addEventListener("click", async () => {
      frameProviderNextButton.disabled = true;
      try {
        const payload = await callInferenceAction("/api/frame-provider/next-frame");
        const frame = payload?.frame || {};
        showToast("Next frame ready", frame.frame_id ? `Loaded ${frame.frame_id}` : "The next frame has been loaded.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Next frame failed", error.message || "Unable to load the next frame", "error");
      } finally {
        frameProviderNextButton.disabled = false;
      }
    });
  }

  const frameProviderRunButton = byId("frame-provider-run-button");
  if (frameProviderRunButton) {
    frameProviderRunButton.addEventListener("click", async () => {
      frameProviderRunButton.disabled = true;
      try {
        await callInferenceAction("/api/inference/run-on-next-frame");
        showToast("Inference completed", "The next unified frame was processed by the AI pipeline.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Inference failed", error.message || "Unable to process the next frame", "error");
      } finally {
        frameProviderRunButton.disabled = false;
      }
    });
  }

  const frameProviderResetButton = byId("frame-provider-reset-button");
  if (frameProviderResetButton) {
    frameProviderResetButton.addEventListener("click", async () => {
      frameProviderResetButton.disabled = true;
      try {
        await callInferenceAction("/api/frame-provider/reset");
        showToast("Frame provider reset", "Provider state has been cleared and rewound.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Reset failed", error.message || "Unable to reset frame provider", "error");
      } finally {
        frameProviderResetButton.disabled = false;
      }
    });
  }

  const sessionStartButton = byId("session-start-button");
  if (sessionStartButton) {
    sessionStartButton.addEventListener("click", async () => {
      sessionStartButton.disabled = true;
      try {
        await callInferenceAction("/api/session/start", { mode: "replay", operator: "dashboard" });
        showToast("Session started", "A new EASY acquisition session is now active.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Session start failed", error.message || "Unable to start session", "error");
      } finally {
        sessionStartButton.disabled = false;
      }
    });
  }

  const sessionStopButton = byId("session-stop-button");
  if (sessionStopButton) {
    sessionStopButton.addEventListener("click", async () => {
      sessionStopButton.disabled = true;
      try {
        await callInferenceAction("/api/session/stop");
        showToast("Session stopped", "The current EASY session has been archived.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        showToast("Session stop failed", error.message || "Unable to stop session", "error");
      } finally {
        sessionStopButton.disabled = false;
      }
    });
  }
}

window.addEventListener("load", () => {
  setupFilters();
  setupButtons();
  refreshDashboard();
  window.setInterval(refreshDashboard, 2500);
  if (byId("thermal-frame") && !dashboardState.liteMode) {
    window.setInterval(reloadThermalFrame, 700);
  }
});
