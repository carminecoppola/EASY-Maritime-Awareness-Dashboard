function reloadThermalFrame() {
  const node = byId(liveActionElementId("thermalImage"));
  if (!node) return;
  node.onload = async () => {
    node.classList.remove("is-hidden");
    await refreshDashboard();
  };
  node.src = `/thermal/frame?ts=${Date.now()}`;
}

async function streamControl(feed, action) {
  return DashboardApi.action(`/video/${feed}/${action}`);
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
    const response = await DashboardApi.request(`/snapshot/${feed}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const payload = response.data || {};
    if (!response.ok || !payload.ok) {
      const fallbackUrl = payload?.snapshot?.url || payload?.url;
      const fallbackFilename = payload?.snapshot?.filename || payload?.filename;
      if (fallbackUrl && fallbackUrl !== "#") {
        await refreshDashboard();
        showToast("Photo saved with a limited source", `${labels[feed] || feed}: ${payload.error || fallbackFilename}`, "info", fallbackUrl);
        const feedbackTitle = byId(liveActionElementId("captureTitle"));
        const feedbackLink = byId(liveActionElementId("captureLink"));
        if (feedbackTitle) feedbackTitle.textContent = `${labels[feed] || feed} · saved, source unavailable`;
        if (feedbackLink) {
          feedbackLink.href = fallbackUrl;
          feedbackLink.hidden = false;
        }
        return;
      }
      throw new Error(payload.error || "Snapshot failed");
    }
    await refreshDashboard();
    showToast("Snapshot saved", `${labels[feed] || feed}: ${payload.filename}`, "success", payload.url);
    const feedbackTitle = byId(liveActionElementId("captureTitle"));
    const feedbackLink = byId(liveActionElementId("captureLink"));
    if (feedbackTitle) feedbackTitle.textContent = `${labels[feed] || feed} · saved just now`;
    if (feedbackLink) {
      feedbackLink.href = payload.url || "/snapshots";
      feedbackLink.hidden = false;
    }
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
  return DashboardApi.action(path, body);
}

function setFeedOverlay(feed, visible, message) {
  if (dashboardState.page === "live" && feed === "thermal") return;
  const overlay = byId(`overlay-${feed}`);
  if (!overlay) return;
  overlay.textContent = visible
    ? humanFeedMessage(
        feed === "thermal" ? "thermal" : "rgb",
        feed === "thermal" ? byId(liveFeedElementId("thermal", "badge"))?.textContent : byId(liveFeedElementId(feed, "badge"))?.textContent,
        message,
      )
    : (message || "");
  overlay.classList.toggle("feed-overlay-hidden", !visible);
  overlay.classList.toggle("is-actionable", Boolean(visible && message));
}

const dashboardState = {
  page: document.body?.dataset?.page || "live",
  presentationMode: document.body?.dataset?.presentationMode === "true",
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
  sessionHistory: [],
  acquisition: null,
  systemStatus: null,
  systemComponents: null,
  snapshots: [],
  snapshotSummary: null,
  sources: null,
  devices: null,
  eventSummary: null,
  eventCount: 0,
  logLimit: 100,
  snapshotLimit: 24,
  logExpandedIds: new Set(),
  initialLogSeverity: new URLSearchParams(window.location.search).get("severity") || "all",
  filters: {
    severity: "all",
    source: "all",
    query: "",
    detection: "all",
    logSeverity: new URLSearchParams(window.location.search).get("severity") || "all",
    logSource: "all",
    logQuery: "",
    snapshotFeed: "all",
  },
};

function applyDashboardPayload(payload) {
  const health = payload?.health || dashboardState.health || {};
  const eventsPayload = payload?.events || { events: [], summary: {} };
  const snapshotsPayload = payload?.snapshots || { items: [], summary: null };
  const inferenceStatus = payload?.inference || {};
  const inferenceCurrent = payload?.detections || {};
  const sessionStatus = payload?.session || health.session || {};
  const acquisition = payload?.acquisition || {};
  const currentEvents = payload?.events_current || { events: [] };
  const eventHistory = payload?.events_history || { events: [] };
  const frameProviderStatus = payload?.frame_provider || inferenceStatus?.frame_provider || {};
  const systemStatus = payload?.system_status || health.system_orchestrator || {};
  const systemComponents = payload?.system_components || health.system_components || {};

  dashboardState.health = health;
  dashboardState.events = eventsPayload?.events || [];
  dashboardState.currentEvents = currentEvents?.events || [];
  dashboardState.eventHistory = eventHistory?.events || [];
  dashboardState.eventSummary = eventsPayload?.summary || null;
  dashboardState.eventCount = eventsPayload?.count ?? dashboardState.events.length;
  dashboardState.detections = health.operations?.detections || inferenceCurrent?.detections || [];
  dashboardState.inferenceStatus = inferenceStatus;
  dashboardState.inferenceCurrent = inferenceCurrent;
  dashboardState.frameProviderStatus = frameProviderStatus;
  dashboardState.sessionStatus = sessionStatus;
  dashboardState.acquisition = acquisition;
  dashboardState.systemStatus = systemStatus;
  dashboardState.systemComponents = systemComponents;
  dashboardState.snapshots = snapshotsPayload?.items || [];
  dashboardState.snapshotSummary = snapshotsPayload?.summary || null;
  dashboardState.sources = payload?.sources || health.sources || null;
  dashboardState.devices = payload?.devices || health.devices || null;

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

  setText(liveFeedElementId("rgb_left", "fps"), rgbLeft.fps != null ? `${Number(rgbLeft.fps).toFixed(1)} fps` : "Loading");
  setText(liveFeedElementId("rgb_right", "fps"), rgbRight.fps != null ? `${Number(rgbRight.fps).toFixed(1)} fps` : "Loading");
  setText(liveFeedElementId("rgb_left", "lastFrame"), rgbLeft.last_acquisition_ts || rgb.last_frame_ts ? formatAgeIt(rgbLeft.last_acquisition_ts || rgb.last_frame_ts) : "No frames yet");
  setText(liveFeedElementId("rgb_right", "lastFrame"), rgbRight.last_acquisition_ts || rgb.last_frame_ts ? formatAgeIt(rgbRight.last_acquisition_ts || rgb.last_frame_ts) : "No frames yet");
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

  if (dashboardState.page === "live" || dashboardState.page === "mission") {
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
}

let dashboardRefreshPromise = null;

function dashboardStateUrl() {
  const eventsLimit = dashboardState.page === "log" ? 250 : 80;
  return `/api/dashboard/state?events_limit=${eventsLimit}&snapshots_limit=12`;
}

async function fetchAndRenderDashboard() {
  try {
    const stateRes = await DashboardApi.request(dashboardStateUrl());
    if (!stateRes.ok || !stateRes.data) {
      throw new Error(stateRes.message || `Refresh failed (${stateRes.status})`);
    }
    const payload = stateRes.data || {};
    applyDashboardPayload(payload);
  } catch (error) {
    console.error(error);
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  }
}

function refreshDashboard() {
  if (dashboardRefreshPromise) return dashboardRefreshPromise;
  dashboardRefreshPromise = fetchAndRenderDashboard().finally(() => {
    dashboardRefreshPromise = null;
  });
  return dashboardRefreshPromise;
}

function setupFilters() {
  const searchInput = byId(logElementId("searchInput"));
  if (searchInput) {
    searchInput.value = "";
    searchInput.addEventListener("input", (event) => {
      dashboardState.filters.logQuery = String(event.target.value || "").trim().toLowerCase();
      renderEventLog(dashboardState.events);
    });
  }

  const sourceSelect = byId(logElementId("sourceSelect"));
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

  const loadMore = byId(logElementId("loadMoreButton"));
  if (loadMore) {
    loadMore.addEventListener("click", () => {
      dashboardState.logLimit += 100;
      renderEventLog(dashboardState.events);
    });
  }
}

function setupSharedInteractions() {
  document.addEventListener("click", async (event) => {
    const historyRow = event.target.closest?.("[data-mission-history-id]");
    if (historyRow) {
      const sessionId = historyRow.dataset.missionHistoryId;
      document.querySelectorAll("[data-mission-history-id]").forEach((row) => {
        const active = row === historyRow;
        row.classList.toggle("is-active", active);
        row.setAttribute("aria-pressed", String(active));
      });
      const response = await DashboardApi.request(`/api/session/manifest?session_id=${encodeURIComponent(sessionId)}`);
      const session = dashboardState.sessionHistory.find((item) => item.session_id === sessionId) || { session_id: sessionId };
      renderMissionHistoryDetail(session, response.data || {});
      return;
    }
    const validateButton = event.target.closest?.("[data-history-validate]");
    if (validateButton) {
      const sessionId = validateButton.dataset.historyValidate;
      validateButton.disabled = true;
      try {
        const response = await DashboardApi.request(`/api/dataset/validate?session_id=${encodeURIComponent(sessionId)}`);
        const payload = response.data || {};
        setText("mission-history-feedback", payload.valid ? `${payload.valid_samples || 0} valid samples.` : `Incomplete dataset: ${payload.incomplete_samples || 0} incomplete samples.`);
      } finally { validateButton.disabled = false; }
      return;
    }
    const exportButton = event.target.closest?.("[data-history-export]");
    if (exportButton) {
      const sessionId = exportButton.dataset.historyExport;
      exportButton.disabled = true;
      try {
        const payload = await callInferenceAction("/api/dataset/export", { session_id: sessionId, validation_percent: 20 });
        setText("mission-history-feedback", `${payload.counts?.samples || 0} samples exported. The ZIP file is ready.`);
        showToast("Mission exported", sessionId, "success", "/api/dataset/export/download");
      } catch (error) {
        setText("mission-history-feedback", error.message || "Export failed");
      } finally { exportButton.disabled = false; }
      return;
    }
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
}

function setupFeedControlButtons() {
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
}

function setupPageInteractions() {
  setupSharedInteractions();
  if (dashboardState.page === "live" || dashboardState.page === "mission") {
    setupLivePage();
    setupFeedControlButtons();
    return;
  }
  if (dashboardState.page === "detections") {
    setupDetectionsPage();
    setupFeedControlButtons();
    return;
  }
  if (dashboardState.page === "log") {
    setupLogPage();
  }
}

let dashboardRuntimeInitialized = false;

function initializeDashboardRuntime() {
  if (dashboardRuntimeInitialized) return;
  dashboardRuntimeInitialized = true;
  if (dashboardState.presentationMode) {
    document.body?.setAttribute("data-runtime-ready", "true");
    return;
  }
  setupFilters();
  setupPageInteractions();
  refreshDashboard();
  loadMissionHistory();
  window.setInterval(refreshDashboard, 2500);
  document.body?.setAttribute("data-runtime-ready", "true");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDashboardRuntime, { once: true });
} else {
  initializeDashboardRuntime();
}
