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

function formatUptime(seconds) {
  if (seconds == null) return "--";
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return days ? `${days}d ${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m ${secs}s`;
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
    FEED_ENABLE: "Feed abilitato",
    FEED_DISABLE: "Feed sospeso",
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
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
  if (type.includes("SNAPSHOT")) return "snapshot";
  if (source.includes("THERMAL")) return "thermal";
  if (source.includes("RGB_CAM") || source.includes("UC512")) return "camera";
  if (source === "SYSTEM") return "system";
  return "other";
}

function getViewMode() {
  return window.localStorage.getItem("easy-dashboard-view") || "simple";
}

function applyViewMode(mode) {
  const resolved = mode === "advanced" ? "advanced" : "simple";
  window.localStorage.setItem("easy-dashboard-view", resolved);
  document.body.classList.toggle("view-simple", resolved === "simple");
  document.body.classList.toggle("view-advanced", resolved === "advanced");
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    const isActive = button.getAttribute("data-view-mode") === resolved;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function humanMissionState(health, thermal, rgb, operations) {
  const sensorHealth = operations?.sensor_health || {};
  const thermalOk = !thermal || (thermal.status !== "NOT_DETECTED" && thermal.status !== "DISABLED" && thermal.status !== "ERROR");
  const cameraFramesReady = Boolean(rgb?.has_frame);
  if (health?.ok && cameraFramesReady && thermalOk) {
    return {
      title: "System ready",
      copy: "All core sensors are online and the console is ready for operation.",
    };
  }
  if (!cameraFramesReady) {
    return {
      title: "Waiting for camera frames",
      copy: "Check that the RGB stream is running and that the cameras are delivering frames.",
    };
  }
  if (!thermalOk) {
    return {
      title: "Thermal unavailable",
      copy: "The thermal sensor is not available yet, so the console is running with limited thermal awareness.",
    };
  }
  if ((sensorHealth.online_count || 0) < (sensorHealth.total_count || 3)) {
    return {
      title: "Needs attention",
      copy: "Some sensors are still coming online or need a quick check.",
    };
  }
  return {
    title: "Needs attention",
    copy: "The dashboard is up, but one or more operational elements still need a look.",
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
    ${actionUrl ? `<a href="${escapeHtml(actionUrl)}" target="_blank" rel="noreferrer">Apri</a>` : ""}
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
  if (["ONLINE", "DETECTED", "READY", "OK"].includes(value)) return { badge: "online", dot: "state-dot-online" };
  if (["BUSY", "WARNING", "WARN"].includes(value)) return { badge: "warning", dot: "state-dot-warning" };
  if (["OFFLINE", "ERROR", "FAILED", "DISABLED"].includes(value)) return { badge: "error", dot: "state-dot-error" };
  if (["STARTING", "LOADING", "WAITING", "CHECKING"].includes(value)) return { badge: "loading", dot: "state-dot-loading" };
  if (value === "PAUSED") return { badge: "muted", dot: "state-dot-muted" };
  return { badge: "muted", dot: "state-dot-muted" };
}

function updateCameraState(prefix, state, message) {
  const tone = stateTone(state);
  setBadge(`${prefix}_state`, state || "--", tone.badge);
  setText(`${prefix}_state_copy`, state || "--");
  setText(`${prefix}_state_msg`, message || "--");
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

function renderEventLog(events) {
  const body = byId("event-body");
  const emptyState = byId("events-empty-state");
  const popover = byId("event-popover");
  if (!body) return;
  const filtered = events.filter((event) => {
    const severity = String(event.severity || "info").toLowerCase();
    const category = eventCategory(event);
    const query = `${event.timestamp || ""} ${event.source || ""} ${event.type || ""} ${event.description || ""}`.toLowerCase();
    const filters = dashboardState.filters;
    const matchesSeverity = filters.severity === "all" || filters.severity === severity;
    const matchesSource = filters.source === "all" || filters.source === category;
    const matchesQuery = !filters.query || query.includes(filters.query);
    return matchesSeverity && matchesSource && matchesQuery;
  });
  body.innerHTML = "";
  if (emptyState) {
    const copy = events.length ? "No events match the current filters." : "No events recorded in this session.";
    emptyState.textContent = copy;
    emptyState.hidden = filtered.length > 0;
  }
  if (popover) {
    popover.hidden = true;
    popover.innerHTML = "";
  }
  if (!filtered.length) {
    return;
  }
  const showPopover = (event) => {
    if (!popover) return;
    popover.innerHTML = `
      <div class="event-popover-head">
        <strong>${escapeHtml(friendlySource(event.source))}</strong>
        <span class="event-severity event-severity-${String(event.severity || "info").toLowerCase()}">${escapeHtml(friendlySeverity(event.severity))}</span>
      </div>
      <p>${escapeHtml(cleanLogText(event.description))}</p>
      <p class="event-popover-action">${escapeHtml(cleanLogText(event.action || "No action required."))}</p>
      <p class="event-popover-detail">${escapeHtml(cleanLogText(event.meta?.detail || event.meta?.message || "No extra detail available."))}</p>
    `;
    popover.hidden = false;
  };
  filtered.forEach((event) => {
    const row = document.createElement("tr");
    const category = eventCategory(event);
    row.className = `event-row event-row-${category}`;
    row.tabIndex = 0;
    row.innerHTML = `
      <td>${escapeHtml(formatRomeDateTime(event.timestamp))}</td>
      <td><span class="event-source event-source-${category}">${escapeHtml(friendlySource(event.source))}</span></td>
      <td>${escapeHtml(friendlyEventType(event.type))}</td>
      <td class="event-severity event-severity-${String(event.severity || "info").toLowerCase()}">${escapeHtml(friendlySeverity(event.severity))}</td>
    `;
    row.addEventListener("mouseenter", () => showPopover(event));
    row.addEventListener("focus", () => showPopover(event));
    row.addEventListener("click", () => showPopover(event));
    body.appendChild(row);
  });
  showPopover(filtered[0]);
  const summaryNode = byId("log-summary");
  if (summaryNode) {
    summaryNode.hidden = false;
    const severityTotals = filtered.reduce((acc, event) => {
      const sev = String(event.severity || "info").toLowerCase();
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});
    summaryNode.innerHTML = `
      <span class="log-chip">Visible <strong>${filtered.length}</strong></span>
      <span class="log-chip">Info <strong>${severityTotals.info || 0}</strong></span>
      <span class="log-chip">Warnings <strong>${severityTotals.warning || 0}</strong></span>
      <span class="log-chip">Errors <strong>${severityTotals.error || 0}</strong></span>
    `;
  }
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
          <a class="btn btn-secondary btn-small" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Apri</a>
          <a class="btn btn-ghost btn-small" href="${escapeHtml(item.download_url)}" download="${escapeHtml(item.filename)}">Scarica</a>
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

function renderMissionPage(health, eventsPayload, snapshots) {
  const operations = health.operations || {};
  const sensorHealth = operations.sensor_health || {};
  const pipeline = operations.pipeline || {};
  const attention = operations.attention || {};
  const detections = operations.detections || [];
  const thermal = health.thermal || {};
  const missionState = humanMissionState(health, thermal, health.rgb || {}, operations);

  setText("mission-header-time", formatRomeDateTime(health.timestamp));
  setText("mission-header-system", missionState.title);
  setText("mission-state-title", missionState.title);
  setText("mission-state-copy", missionState.copy);
  setText("summary-sensors-online", `${sensorHealth.online_count ?? 0}/${sensorHealth.total_count ?? 3}`);
  setText("summary-sensors-detail", `${sensorHealth.detected_count ?? 0} detected · ${sensorHealth.online_count ?? 0} online`);
  setText("summary-thermal", thermal.status || thermal.mode || "Not available");
  setText("summary-thermal-detail", thermal.message || "Thermal status is being loaded");
  setText("summary-snapshots", `${snapshots.length}`);
  setText("summary-snapshots-detail", snapshots[0] ? `${snapshots[0].feed_label || snapshots[0].feed} · ${formatAgeIt(snapshots[0].created_ts)}` : "No snapshots captured in this session");
  setText("summary-events", `${eventsPayload?.count ?? dashboardState.events.length}`);
  const severity = eventsPayload?.summary?.severity || {};
  setText("summary-events-detail", `${severity.warning || 0} avvisi, ${severity.error || 0} errori`);
  setText("summary-recording", pipeline.recording?.state || "Not connected");
  setText("summary-recording-detail", pipeline.recording?.message || "Recording controls are available from Acquisition");
  setText("summary-inference", pipeline.inference?.state || "AI analysis not connected yet");
  setText("summary-inference-detail", pipeline.inference?.message || "AI analysis not connected yet");
  setText("attention-level", attention.level || "LOW");
  setText("attention-reason", attention.reason || "System status is being loaded");
  renderMissionDetections("current-detections", detections);
  renderMissionList("mission-sensor-health", [
    { label: "Sensors online", value: `${sensorHealth.online_count ?? 0}/${sensorHealth.total_count ?? 3}`, status: "OK", tone: "muted" },
    { label: "RGB LEFT", value: sensorHealth.rgb_left?.state || "Loading", status: sensorHealth.rgb_left?.enabled ? "ENABLED" : "PAUSED", tone: sensorHealth.rgb_left?.enabled ? "muted" : "error" },
    { label: "RGB RIGHT", value: sensorHealth.rgb_right?.state || "Loading", status: sensorHealth.rgb_right?.enabled ? "ENABLED" : "PAUSED", tone: sensorHealth.rgb_right?.enabled ? "muted" : "error" },
    { label: "THERMAL", value: `${sensorHealth.thermal?.state || "Loading"} · ${sensorHealth.thermal?.mode || "Loading"}`, status: sensorHealth.thermal?.detected ? "ONLINE" : "MOCK", tone: sensorHealth.thermal?.detected ? "muted" : "warn" },
  ]);
  renderMissionList("mission-pipeline-health", [
    { label: "Fused view", value: pipeline.fusion?.message || "Multimodal fusion preview. RGB + Thermal fusion will appear here.", status: pipeline.fusion?.state || "Preview not connected", tone: "muted" },
    { label: "Inference", value: pipeline.inference?.message || "AI analysis not connected yet.", status: pipeline.inference?.state || "Not connected", tone: "muted" },
    { label: "Recording", value: pipeline.recording?.message || "Recording controls are available from Acquisition.", status: pipeline.recording?.state || "Not connected", tone: pipeline.recording?.supported ? "muted" : "warn" },
    { label: "Snapshot", value: pipeline.snapshot?.message || "Snapshot capture ready", status: pipeline.snapshot?.state || "READY", tone: "muted" },
  ]);
  setText("fused-state", pipeline.fusion?.state || "Preview not connected");
  setText("fused-fusion-state", pipeline.fusion?.state || "Preview not connected");
  setText("fused-detection-state", detections.length ? "Active" : "Idle");
  setText("fused-inference-state", pipeline.inference?.state || "AI analysis not connected yet");
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

  setText("sensors-header-streams", `${sensorHealth.online_count ?? 0}/${sensorHealth.total_count ?? 3} online`);
  setText("sensors-header-snapshots", `${snapshots.length}`);
  setText("sensors-header-recording", pipeline.recording?.state || "Not connected");
  setText("sensors-header-errors", `${(dashboardState.events || []).filter((event) => String(event.severity || "").toLowerCase() === "error").length}`);
  setText("acq-rgb-left-state", rgbLeft.state || rgb.camera_state || "Loading");
  setText("acq-rgb-left-meta", `${rgbLeft.fps != null ? `${Number(rgbLeft.fps).toFixed(1)} fps` : "No FPS yet"} · ${rgbLeft.message || rgb.message || "Waiting for camera frames. Check that the stream is running."}`);
  setText("acq-rgb-right-state", rgbRight.state || rgb.camera_state || "Loading");
  setText("acq-rgb-right-meta", `${rgbRight.fps != null ? `${Number(rgbRight.fps).toFixed(1)} fps` : "No FPS yet"} · ${rgbRight.message || rgb.message || "Waiting for camera frames. Check that the stream is running."}`);
  setText("acq-thermal-state", thermal.status || thermal.mode || "Loading");
  setText("acq-thermal-meta", thermal.message || "Thermal status is being loaded");
  setText("acq-recording-state", pipeline.recording?.state || "Not connected");
  setText("acq-recording-meta", pipeline.recording?.message || "Recording controls are available from Acquisition");
  setText("acq-control-state", health.ok ? "Ready" : "Needs attention");
  renderHealthSummary("acquisition-health", [
    { label: "RGB LEFT", value: `${rgbLeft.state || "Loading"} · ${rgbLeft.message || "Waiting for camera frames. Check that the stream is running."}`, tone: rgbLeft.enabled ? "muted" : "error" },
    { label: "RGB RIGHT", value: `${rgbRight.state || "Loading"} · ${rgbRight.message || "Waiting for camera frames. Check that the stream is running."}`, tone: rgbRight.enabled ? "muted" : "error" },
    { label: "THERMAL", value: `${thermal.status || "Loading"} · ${thermal.message || "Thermal status is being loaded"}`, tone: thermal.anomaly_active ? "warn" : "muted" },
    { label: "Recording", value: pipeline.recording?.state || "Not connected", tone: pipeline.recording?.supported ? "muted" : "warn" },
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
  const summary = [thermal.min_c, thermal.avg_c, thermal.max_c].map((item) => (item == null ? "Not available" : `${item} °C`)).join(" / ");
  setText("thermal-page-state", thermal.status || thermal.mode || "Loading thermal state");
  setText("thermal-page-metrics", summary);
  setText("thermal-page-alarm", thermal.anomaly_active ? "Active" : "Clear");
  setText("thermal-page-events", `${eventsPayload?.count ?? dashboardState.events.length}`);
  setText("thermal-alarm-reason", thermal.message || (thermal.anomaly_active ? "Thermal anomaly detected." : "Thermal feed nominal."));
  setText("thermal_state", thermal.status || thermal.mode || "Loading thermal state");
  setText("thermal_state_copy", thermal.status || thermal.mode || "Loading thermal state");
  setText("thermal_state_msg", thermal.message || "Thermal status is being loaded");
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
  const pipeline = operations.pipeline || {};
  const sensorHealth = operations.sensor_health || {};
  const rgbCams = cameras.rgb_cameras || [];
  const thermalCam = cameras.thermal_camera || {};
  const uc512 = cameras.uc512_multiplexer || {};

  setText("system-header-cpu", `${system.cpu_percent ?? "--"}%`);
  setText("system-header-ram", `${system.ram?.percent ?? "--"}%`);
  setText("system-header-uptime", formatUptime(system.uptime_seconds));
  setText("system-header-model", system.model || "--");
  setText("cpu-percent", `${system.cpu_percent ?? "--"}%`);
  setText("cpu-temp", system.cpu_temperature_c != null ? `${system.cpu_temperature_c} °C` : "--");
  setText("ram-percent", `${system.ram?.percent ?? "--"}%`);
  setText("disk-percent", `${system.disk?.percent ?? "--"}%`);
  setText("uptime", formatUptime(system.uptime_seconds));
  setText("pi-model", system.model || "--");

  renderHealthSummary("system-pipeline-health", [
    { label: "Fusion", value: pipeline.fusion?.state || "Preview not connected", tone: "muted" },
    { label: "Inference", value: pipeline.inference?.state || "AI analysis not connected yet", tone: "muted" },
    { label: "Recording", value: pipeline.recording?.state || "Not connected", tone: pipeline.recording?.supported ? "muted" : "warn" },
    { label: "Snapshot", value: pipeline.snapshot?.state || "Ready", tone: "muted" },
  ]);

  const services = [
    { label: uc512.logical_name || "UC512_MULTIPLEXER", value: `${uc512.hardware_name || "Arducam CamArray UC-512"} · ${uc512.state || "Loading"}${uc512.message ? ` · ${uc512.message}` : ""}`, status: uc512.state || "Loading", tone: "muted" },
    { label: "RGB_CAM_LEFT", value: `${rgbCams[0]?.hardware_name || "Arducam UC-517 LEFT"} · ${rgbCams[0]?.state || "Loading"} · ${rgbCams[0]?.fps != null ? `${Number(rgbCams[0].fps).toFixed(1)} fps` : "Loading"}`, status: rgbCams[0]?.enabled ? "ONLINE" : "PAUSED", tone: rgbCams[0]?.enabled ? "muted" : "error" },
    { label: "RGB_CAM_RIGHT", value: `${rgbCams[1]?.hardware_name || "Arducam UC-517 RIGHT"} · ${rgbCams[1]?.state || "Loading"} · ${rgbCams[1]?.fps != null ? `${Number(rgbCams[1].fps).toFixed(1)} fps` : "Loading"}`, status: rgbCams[1]?.enabled ? "ONLINE" : "PAUSED", tone: rgbCams[1]?.enabled ? "muted" : "error" },
    { label: "THERMAL_FLIR", value: `${thermalCam.hardware_name || "FLIR/Lepton Thermal Sensor"} · ${thermalCam.state || "Loading"} · ${thermalCam.mode || "Loading"}`, status: thermalCam.state || "Loading", tone: thermalCam.state === "OFFLINE" ? "error" : "muted" },
    { label: "Sensors online", value: `${sensorHealth.online_count ?? 0}/${sensorHealth.total_count ?? 3}`, status: "SUMMARY", tone: "muted" },
  ];
  renderMissionList("system-service-list", services);

  const recentErrors = dashboardState.events.filter((event) => String(event.severity || "").toLowerCase() === "error").slice(0, 4);
  renderKeyValueList(
    "recent-errors-list",
    recentErrors.length
      ? recentErrors.map((event) => ({
          label: `${friendlySource(event.source)} · ${friendlyEventType(event.type)}`,
          value: cleanLogText(event.description || event.action || "Error"),
          tone: "error",
        }))
    : [{ label: "No recent errors", value: "The system is healthy right now.", tone: "muted" }],
  );
}

function updateNavIndicators(health, eventsPayload, snapshots) {
  const sensorHealth = health?.operations?.sensor_health || {};
  const thermal = health?.thermal || {};
  const errors = eventsPayload?.summary?.severity?.error || 0;
  const warnings = eventsPayload?.summary?.severity?.warning || 0;
  const alerts = errors + warnings;
  const offlineSensors = Math.max(0, (sensorHealth.total_count || 0) - (sensorHealth.online_count || 0));
  document.querySelectorAll("[data-nav-key]").forEach((link) => {
    const key = link.getAttribute("data-nav-key");
    const dot = link.querySelector(".nav-status-dot");
    const badge = link.querySelector(".nav-alert-badge");
    let tone = "muted";
    let count = 0;
    if (key === "mission") {
      tone = health?.ok ? "online" : "warning";
      count = alerts;
    } else if (key === "sensors") {
      tone = offlineSensors > 0 ? "warning" : "online";
      count = offlineSensors;
    } else if (key === "thermal") {
      tone = thermal.anomaly_active || alerts > 0 ? "warning" : "online";
      count = alerts;
    } else if (key === "system") {
      tone = errors > 0 ? "warning" : "online";
      count = errors;
    } else if (key === "snapshots") {
      tone = snapshots?.length ? "online" : "muted";
      count = 0;
    }
    if (dot) {
      dot.classList.remove("is-online", "is-warning", "is-error", "is-muted", "is-loading");
      dot.classList.add(`is-${tone}`);
    }
    if (badge) {
      badge.hidden = !count;
      badge.textContent = count ? String(count) : "";
    }
  });
}

function reloadThermalFrame() {
  const node = byId("thermal-frame");
  if (node) node.src = `/thermal/frame?ts=${Date.now()}`;
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

function setFeedOverlay(feed, visible, message) {
  const overlay = byId(`overlay-${feed}`);
  if (!overlay) return;
  overlay.textContent = message || "";
  overlay.classList.toggle("feed-overlay-hidden", !visible);
}

const dashboardState = {
  page: document.body?.dataset?.page || "mission",
  events: [],
  snapshots: [],
  snapshotSummary: null,
  filters: {
    severity: "all",
    source: "all",
    query: "",
  },
};

async function refreshDashboard() {
  try {
    const [healthRes, eventsRes, snapshotsRes] = await Promise.all([
      fetch("/health", { cache: "no-store" }),
      fetch("/events?limit=24", { cache: "no-store" }),
      fetch("/api/snapshots/recent?limit=12", { cache: "no-store" }),
    ]);
    const health = await healthRes.json();
    const eventsPayload = await eventsRes.json();
    const snapshotsPayload = await snapshotsRes.json();

    dashboardState.events = eventsPayload?.events || [];
    dashboardState.snapshots = snapshotsPayload?.items || [];
    dashboardState.snapshotSummary = snapshotsPayload?.summary || null;

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
    setText("summary-inference", pipeline.inference?.state || "AI analysis not connected yet");
    setText("summary-inference-detail", pipeline.inference?.message || "AI analysis not connected yet");

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
    updateNavIndicators(health, eventsPayload, dashboardState.snapshots);

    if (dashboardState.page === "mission") {
      renderMissionPage(health, eventsPayload, dashboardState.snapshots);
    }
    if (dashboardState.page === "sensors") {
      renderSensorsPage(health, dashboardState.snapshots);
    }
    if (dashboardState.page === "thermal") {
      renderThermalPage(health, eventsPayload);
    }
    if (dashboardState.page === "system") {
      renderSystemPage(health);
    }
    if (dashboardState.page === "snapshots") {
      setText("snapshot-count", `${dashboardState.snapshotSummary?.count ?? dashboardState.snapshots.length}`);
      setText("snapshot-total-size", formatBytes(dashboardState.snapshotSummary?.size_bytes || 0));
      const latest = dashboardState.snapshotSummary?.latest || dashboardState.snapshots[0];
      setText("snapshot-latest-time", latest ? `Roma ${formatRomeDateTime(latest.created)}` : "--");
      setText("snapshots-header-count", `${dashboardState.snapshotSummary?.count ?? dashboardState.snapshots.length}`);
      setText("snapshots-header-latest", latest ? latest.feed_label || latest.feed || "--" : "--");
      setText("snapshots-header-size", formatBytes(dashboardState.snapshotSummary?.size_bytes || 0));
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

    setFeedOverlay("rgb_left", !rgb.has_frame || rgbLeft.enabled === false, rgbLeft.enabled === false ? "Stream paused" : rgbLeft.message || "Waiting for camera frames. Check that the stream is running.");
    setFeedOverlay("rgb_right", !rgb.has_frame || rgbRight.enabled === false, rgbRight.enabled === false ? "Stream paused" : rgbRight.message || "Waiting for camera frames. Check that the stream is running.");
    setFeedOverlay("thermal", false, thermal.message || "Thermal monitor active");
  } catch (error) {
    console.error(error);
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  }
}

function setupFilters() {
  const searchInput = byId("log-search");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      dashboardState.filters.query = String(event.target.value || "").trim().toLowerCase();
      renderEventLog(dashboardState.events);
    });
  }

  document.querySelectorAll("[data-severity-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.severity = button.getAttribute("data-severity-filter") || "all";
      document.querySelectorAll("[data-severity-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderEventLog(dashboardState.events);
    });
  });

  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.source = button.getAttribute("data-source-filter") || "all";
      document.querySelectorAll("[data-source-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderEventLog(dashboardState.events);
    });
  });
}

function setupButtons() {
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

  document.querySelectorAll("[data-placeholder-control]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-placeholder-control") || "placeholder";
      const labelMap = {
        "record-start": "Start recording is not connected yet.",
        "record-stop": "Stop recording is not connected yet.",
        "record-clip": "Clip marking is not connected yet.",
        fusion: "Fusion preview is not connected yet.",
        inference: "AI analysis is not connected yet.",
      };
      showToast("Not connected yet", labelMap[action] || "This control is not connected yet.", "info");
    });
  });

  const thermalButton = byId("thermal-snapshot");
  if (thermalButton) {
    thermalButton.addEventListener("click", async () => {
      await snapshot("thermal");
    });
  }

  document.querySelectorAll("[data-feed-image]").forEach((img) => {
    img.addEventListener("load", () => {
      const feed = img.getAttribute("data-feed-image");
      setFeedOverlay(feed, false, "");
    });
    img.addEventListener("error", () => {
      const feed = img.getAttribute("data-feed-image");
      setFeedOverlay(feed, true, "Preview unavailable");
    });
  });
}

function setupViewToggle() {
  applyViewMode(getViewMode());
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      applyViewMode(button.getAttribute("data-view-mode"));
      renderEventLog(dashboardState.events);
    });
  });
}

window.addEventListener("load", () => {
  setupFilters();
  setupButtons();
  setupViewToggle();
  refreshDashboard();
  window.setInterval(refreshDashboard, 2500);
  if (byId("thermal-frame")) {
    window.setInterval(reloadThermalFrame, 700);
  }
});
