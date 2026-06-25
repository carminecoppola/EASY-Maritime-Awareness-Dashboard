function byId(id) {
  return document.getElementById(id);
}

const dashboardState = {
  events: [],
  snapshots: [],
  filters: {
    severity: "all",
    source: "all",
    query: "",
  },
};

function formatAge(epochSeconds) {
  if (!epochSeconds) {
    return "--";
  }
  const age = Math.max(0, Math.round(Date.now() / 1000 - epochSeconds));
  if (age < 1) return "now";
  if (age < 60) return `${age}s ago`;
  const minutes = Math.floor(age / 60);
  const seconds = age % 60;
  return `${minutes}m ${seconds}s ago`;
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

function formatUptime(seconds) {
  if (seconds == null) return "--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h ${m}m ${r}s`;
}

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatSnapshotAge(createdTs) {
  if (!createdTs) return "--";
  const diff = Math.max(0, Math.round(Date.now() / 1000 - createdTs));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
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

function friendlySource(value) {
  const map = {
    SYSTEM: "Sistema",
    UC512_MULTIPLEXER: "Camera UC512",
    RGB_CAM_LEFT: "RGB sinistra",
    RGB_CAM_RIGHT: "RGB destra",
    RGB_LEFT: "RGB sinistra",
    RGB_RIGHT: "RGB destra",
    THERMAL_FLIR: "Termica",
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
}

function friendlySeverity(value) {
  const map = {
    info: "Info",
    warning: "Avviso",
    error: "Errore",
  };
  return map[String(value || "info").toLowerCase()] || String(value || "Info");
}

function cleanLogText(value) {
  return String(value || "--")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    DETECTED: "Rilevato",
    NOT_DETECTED: "Non rilevato",
  };
  return map[String(value || "").toUpperCase()] || String(value || "--");
}

function setBadge(id, text, severity) {
  const node = byId(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("badge-muted", "badge-error");
  if (severity === "muted") node.classList.add("badge-muted");
  if (severity === "error") node.classList.add("badge-error");
}

function stateTone(state) {
  const value = String(state || "--").toUpperCase();
  if (value === "BUSY") return { badge: "error", dot: "state-dot-warn" };
  if (value === "OFFLINE") return { badge: "error", dot: "state-dot-error" };
  if (value === "PAUSED") return { badge: "muted", dot: "state-dot-muted" };
  if (value === "DETECTED") return { badge: "muted", dot: "" };
  return { badge: "muted", dot: "state-dot-muted" };
}

function updateCameraState(prefix, state, message) {
  const tone = stateTone(state);
  setBadge(`${prefix}_state`, state || "--", tone.badge);
  setText(`${prefix}_state_label`, state || "--");
  setText(`${prefix}_state_copy`, state || "--");
  setText(`${prefix}_state_msg`, message || "--");
  setText(`${prefix}_message`, message || "--");
  const dot = byId(`${prefix}_dot`);
  if (dot) {
    dot.classList.remove("state-dot-muted", "state-dot-error", "state-dot-warn");
    if (tone.dot) dot.classList.add(tone.dot);
  }
}

async function streamControl(feed, action) {
  const response = await fetch(`/video/${feed}/${action}`, { method: "POST" });
  return response.json();
}

async function snapshot(feed) {
  const overlay = byId(`overlay-${feed}`);
  if (overlay) {
    overlay.textContent = "Saving snapshot...";
    overlay.classList.remove("feed-overlay-hidden");
  }
  try {
    const response = await fetch(`/snapshot/${feed}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Snapshot failed");
    }
    await refreshDashboard();
    if (overlay) {
      overlay.textContent = "Snapshot salvato";
      window.setTimeout(() => setFeedOverlay(feed, false, ""), 1500);
    }
  } catch (error) {
    console.error(error);
    if (overlay) {
      overlay.textContent = error.message || "Snapshot failed";
    }
  }
}

function reloadThermalFrame() {
  const node = byId("thermal-frame");
  if (node) {
    node.src = `/thermal/frame?ts=${Date.now()}`;
  }
}

function reloadRgbFeed(feed) {
  const img = document.querySelector(`[data-feed-image="${feed}"]`);
  if (img) {
    img.src = `/video/${feed}?ts=${Date.now()}`;
  }
}

function setFeedOverlay(feed, visible, message) {
  const overlay = byId(`overlay-${feed}`);
  if (!overlay) return;
  overlay.textContent = message || "";
  overlay.classList.toggle("feed-overlay-hidden", !visible);
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

function updateSummaryCards(health, eventsPayload, snapshots) {
  const rgb = health?.rgb || {};
  const thermal = health?.thermal || {};
  setText("summary-rgb", rgb.status || rgb.camera_state || "UNKNOWN");
  setText("summary-rgb-detail", rgb.message || "Stream RGB");
  setText("summary-thermal", thermal.status || thermal.mode || "UNKNOWN");
  setText("summary-thermal-detail", thermal.message || "Termica");
  setText("summary-snapshots", `${snapshots.length}`);
  if (snapshots[0]) {
    setText("summary-snapshots-detail", `${snapshots[0].feed_label || snapshots[0].feed} · ${formatAgeIt(snapshots[0].created_ts)}`);
  } else {
    setText("summary-snapshots-detail", "Nessuno snapshot");
  }
  const eventCount = eventsPayload?.count ?? dashboardState.events.length;
  setText("summary-events", `${eventCount}`);
  const severity = eventsPayload?.summary?.severity || {};
  const warningCount = severity.warning || 0;
  const errorCount = severity.error || 0;
  setText("summary-events-detail", `${warningCount} avvisi, ${errorCount} errori`);
}

function renderLogSummary(filteredEvents) {
  const node = byId("log-summary");
  if (!node) return;
  const severityTotals = filteredEvents.reduce((acc, event) => {
    const sev = String(event.severity || "info").toLowerCase();
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {});
  node.innerHTML = `
    <span class="log-chip">Visibili <strong>${filteredEvents.length}</strong></span>
    <span class="log-chip">Info <strong>${severityTotals.info || 0}</strong></span>
    <span class="log-chip">Avvisi <strong>${severityTotals.warning || 0}</strong></span>
    <span class="log-chip">Errori <strong>${severityTotals.error || 0}</strong></span>
  `;
}

function renderEventLog() {
  const body = byId("event-body");
  if (!body) return;
  const filtered = dashboardState.events.filter((event) => {
    const severity = String(event.severity || "info").toLowerCase();
    const category = eventCategory(event);
    const query = `${event.timestamp || ""} ${event.source || ""} ${event.type || ""} ${event.description || ""}`.toLowerCase();
    const matchesSeverity = dashboardState.filters.severity === "all" || dashboardState.filters.severity === severity;
    const matchesSource = dashboardState.filters.source === "all" || dashboardState.filters.source === category;
    const matchesQuery = !dashboardState.filters.query || query.includes(dashboardState.filters.query);
    return matchesSeverity && matchesSource && matchesQuery;
  });
  body.innerHTML = "";
  filtered.forEach((event) => {
    const row = document.createElement("tr");
    const category = eventCategory(event);
    row.className = `event-row event-row-${category}`;
    row.innerHTML = `
      <td>${escapeHtml(formatRomeDateTime(event.timestamp))}</td>
      <td><span class="event-source event-source-${category}">${escapeHtml(friendlySource(event.source))}</span></td>
      <td>${escapeHtml(friendlyEventType(event.type))}</td>
      <td>${escapeHtml(cleanLogText(event.description))}</td>
      <td class="event-severity event-severity-${String(event.severity || "info").toLowerCase()}">${escapeHtml(friendlySeverity(event.severity))}</td>
    `;
    body.appendChild(row);
  });
  renderLogSummary(filtered);
}

function renderSnapshotGallery() {
  const grid = byId("snapshot-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!dashboardState.snapshots.length) {
    grid.innerHTML = `<div class="empty-state">Nessuno snapshot salvato.</div>`;
  }
  dashboardState.snapshots.forEach((item) => {
    const card = document.createElement("article");
    card.className = "snapshot-card";
    const feedLabel = item.feed_label || item.feed || "--";
    card.innerHTML = `
      <a class="snapshot-image-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
        <img class="snapshot-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(feedLabel)} snapshot">
      </a>
      <div class="snapshot-card-body">
        <div class="snapshot-card-head">
          <div>
            <span class="snapshot-feed">${escapeHtml(feedLabel)}</span>
            <strong title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</strong>
          </div>
          <span class="snapshot-age">${escapeHtml(formatRomeDateTime(item.created))}</span>
        </div>
        <p class="snapshot-meta-line">${escapeHtml(formatBytes(item.size_bytes))} · Roma ${escapeHtml(formatRomeDateTime(item.created))}</p>
        <div class="button-row snapshot-actions">
          <a class="btn btn-secondary btn-small" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open</a>
          <a class="btn btn-ghost btn-small" href="${escapeHtml(item.download_url)}" download="${escapeHtml(item.filename)}">Download</a>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  setText("snapshot-count", `${dashboardState.snapshots.length}`);
  const latest = dashboardState.snapshots[0];
  setText("snapshot-latest-feed", latest ? (latest.feed_label || latest.feed || "--") : "--");
  setText("snapshot-latest-time", latest ? `Roma ${formatRomeDateTime(latest.created)}` : "--");
}

async function refreshDashboard() {
  try {
    const [healthRes, eventsRes, snapshotsRes] = await Promise.all([
      fetch("/health", { cache: "no-store" }),
      fetch("/events?limit=20", { cache: "no-store" }),
      fetch("/api/snapshots/recent?limit=12", { cache: "no-store" }),
    ]);
    const health = await healthRes.json();
    const eventsPayload = await eventsRes.json();
    const snapshotsPayload = await snapshotsRes.json();

    const system = health.system || {};
    const cameras = health.cameras || {};
    const rgb = health.rgb || {};
    const thermal = health.thermal || {};
    const rgbCams = cameras.rgb_cameras || [];
    const rgbLeft = rgbCams[0] || {};
    const rgbRight = rgbCams[1] || {};
    const uc512 = cameras.uc512_multiplexer || {};
    const thermalCam = cameras.thermal_camera || {};

    setText("timestamp", formatRomeDateTime(health.timestamp));
    setText("system-state", health.ok ? "READY" : "DEGRADED");
    setText("cpu-percent", `${system.cpu_percent ?? "--"}%`);
    setText("cpu-temp", system.cpu_temperature_c != null ? `${system.cpu_temperature_c} C` : "--");
    setText("ram-percent", `${system.ram?.percent ?? "--"}%`);
    setText("disk-percent", `${system.disk?.percent ?? "--"}%`);
    setText("uptime", formatUptime(system.uptime_seconds));
    setText("pi-model", system.model || "--");
    updateCameraState("rgb_left", rgbLeft.state || rgb.camera_state || "DETECTED", rgbLeft.message || rgb.message || "Ready");
    updateCameraState("rgb_right", rgbRight.state || rgb.camera_state || "DETECTED", rgbRight.message || rgb.message || "Ready");
    const thermalDetail = thermal.message || ((thermalCam.status && thermalCam.status.message) || "Thermal feed ready");
    updateCameraState("thermal", thermal.status || thermalCam.state || "--", thermalDetail);
    setText("thermal_state_label", thermal.status || thermalCam.state || "--");
    setText("thermal_state_copy", thermal.status || thermalCam.state || "--");
    setText("thermal_state_msg", thermalDetail);
    setBadge("thermal_state", thermal.status || "--", thermal.status === "NOT_DETECTED" || thermal.status === "DISABLED" ? "error" : "muted");
    setText("rgb_left_fps", rgbLeft.fps != null ? `${Number(rgbLeft.fps).toFixed(1)} fps` : "--");
    setText("rgb_right_fps", rgbRight.fps != null ? `${Number(rgbRight.fps).toFixed(1)} fps` : "--");
    setText("rgb_left_last", formatAgeIt(rgbLeft.last_acquisition_ts || rgb.last_frame_ts));
    setText("rgb_right_last", formatAgeIt(rgbRight.last_acquisition_ts || rgb.last_frame_ts));
    setText("rgb_left_error", rgbLeft.error || rgb.error || "--");
    setText("rgb_right_error", rgbRight.error || rgb.error || "--");
    const thermalUnit = thermal.unit === "raw" ? "raw" : "C";
    setText("thermal_min", thermal.min_c != null ? `${thermal.min_c} ${thermalUnit}` : (thermal.raw_min != null ? `${thermal.raw_min} raw` : "--"));
    setText("thermal_avg", thermal.avg_c != null ? `${thermal.avg_c} ${thermalUnit}` : (thermal.raw_avg != null ? `${thermal.raw_avg} raw` : "--"));
    setText("thermal_max", thermal.max_c != null ? `${thermal.max_c} ${thermalUnit}` : (thermal.raw_max != null ? `${thermal.raw_max} raw` : "--"));
    setText("thermal_anomaly", thermal.hotspot_percent != null ? `${thermal.hotspot_percent}%` : (thermal.anomaly_active ? "SI" : "NO"));
    dashboardState.events = (eventsPayload && eventsPayload.events) || [];
    dashboardState.snapshots = (snapshotsPayload && snapshotsPayload.items) || [];
    updateSummaryCards(health, eventsPayload, dashboardState.snapshots);
    const hasRgbFrame = Boolean(rgb.has_frame);
    setFeedOverlay(
      "rgb_left",
      !hasRgbFrame || rgbLeft.enabled === false,
      rgbLeft.enabled === false ? "Stream paused" : rgbLeft.message || rgb.message || "Waiting for frame..."
    );
    setFeedOverlay(
      "rgb_right",
      !hasRgbFrame || rgbRight.enabled === false,
      rgbRight.enabled === false ? "Stream paused" : rgbRight.message || rgb.message || "Waiting for frame..."
    );
    setFeedOverlay("thermal", false, thermal.message || "Thermal stream active");

    const deviceList = byId("device-list");
    if (deviceList) {
      deviceList.innerHTML = [
        `<div class="device-row"><strong>${uc512.logical_name || "UC512_MULTIPLEXER"}</strong><div>${uc512.hardware_name || ""}</div><div>Status: ${uc512.state || "--"}${uc512.message ? ` | ${uc512.message}` : ""}</div></div>`,
        ...rgbCams.map((cam) => `<div class="device-row"><strong>${cam.logical_name}</strong><div>${cam.hardware_name}</div><div>Status: ${cam.state || "--"} | FPS: ${cam.fps ?? "--"}${cam.message ? ` | ${cam.message}` : ""}</div></div>`),
        `<div class="device-row"><strong>${thermalCam.logical_name || "THERMAL_FLIR"}</strong><div>${thermalCam.hardware_name || ""}</div><div>Status: ${thermalCam.state || "--"} | Mode: ${thermalCam.mode || "--"}</div></div>`,
      ].join("");
    }

    renderSnapshotGallery();
    renderEventLog();
  } catch (error) {
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  }
}

window.addEventListener("load", () => {
  const searchInput = byId("log-search");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      dashboardState.filters.query = String(event.target.value || "").trim().toLowerCase();
      renderEventLog();
    });
  }

  document.querySelectorAll("[data-severity-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.severity = button.getAttribute("data-severity-filter") || "all";
      document.querySelectorAll("[data-severity-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderEventLog();
    });
  });

  document.querySelectorAll("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.source = button.getAttribute("data-source-filter") || "all";
      document.querySelectorAll("[data-source-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderEventLog();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const feed = button.getAttribute("data-feed");
      const action = button.getAttribute("data-action");
      try {
        await streamControl(feed, action);
        if (action === "start") {
          reloadRgbFeed(feed);
        }
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

  const rgbImages = document.querySelectorAll("[data-feed-image]");
  rgbImages.forEach((img) => {
    img.addEventListener("load", () => {
      const feed = img.getAttribute("data-feed-image");
      setFeedOverlay(feed, false, "");
    });
    img.addEventListener("error", () => {
      const feed = img.getAttribute("data-feed-image");
      setFeedOverlay(feed, true, "Feed unavailable");
    });
  });

  refreshDashboard();
  window.setInterval(refreshDashboard, 2500);
  window.setInterval(reloadThermalFrame, 700);
});
