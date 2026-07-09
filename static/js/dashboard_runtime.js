function reloadThermalFrame() {
  const node = byId(liveActionElementId("thermalImage"));
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
  systemStatus: null,
  systemComponents: null,
  snapshots: [],
  snapshotSummary: null,
  sources: null,
  devices: null,
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

function applyDashboardPayload(payload) {
  const health = payload?.health || dashboardState.health || {};
  const eventsPayload = payload?.events || { events: [], summary: {} };
  const snapshotsPayload = payload?.snapshots || { items: [], summary: null };
  const inferenceStatus = payload?.inference || {};
  const inferenceCurrent = payload?.detections || {};
  const sessionStatus = payload?.session || health.session || {};
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
}

async function refreshDashboard() {
  try {
    const stateRes = await fetchJson("/api/dashboard/state?events_limit=9999&snapshots_limit=12");
    const payload = stateRes.data || {};
    applyDashboardPayload(payload);
  } catch (error) {
    console.error(error);
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  }
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

function setupLivePage() {
  const sourcesRefreshButton = byId(liveActionElementId("sourceRefreshButton"));
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

  const liveSnapshotButton = byId(liveActionElementId("snapshot"));
  if (liveSnapshotButton) {
    liveSnapshotButton.addEventListener("click", async () => {
      const health = dashboardState.health || {};
      const thermal = health.thermal || {};
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

  const liveRecordButton = byId(liveActionElementId("record"));
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

function setupDetectionsPage() {
  const thermalButton = byId("thermal-snapshot");
  if (thermalButton) {
    thermalButton.addEventListener("click", async () => {
      await snapshot("thermal");
    });
  }

  const aiStartButton = byId(detectionsElementId("aiStartButton"));
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

  const aiStopButton = byId(detectionsElementId("aiStopButton"));
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

  const aiRunButton = byId(detectionsElementId("aiRunDemoButton"));
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

  const aiRefreshButton = byId(detectionsElementId("aiRefreshButton"));
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

  const frameProviderConfigureButton = byId("button-frame-provider-configure");
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

  const frameProviderNextButton = byId("button-frame-provider-next");
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

  const frameProviderRunButton = byId("button-frame-provider-run");
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

  const frameProviderResetButton = byId("button-frame-provider-reset");
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

  const sessionStartButton = byId(detectionsElementId("sessionStartButton"));
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

  const sessionStopButton = byId(detectionsElementId("sessionStopButton"));
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

function setupLogPage() {
  const logExportButton = byId(logElementId("exportButton"));
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
}

function setupPageInteractions() {
  setupSharedInteractions();
  if (dashboardState.page === "live") {
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

window.addEventListener("load", () => {
  setupFilters();
  setupPageInteractions();
  refreshDashboard();
  window.setInterval(refreshDashboard, 2500);
  if (byId(liveActionElementId("thermalImage")) && !dashboardState.liteMode) {
    window.setInterval(reloadThermalFrame, 700);
  }
});
