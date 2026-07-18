function liveFeedElementId(feedKey, part) {
  const base = `live-feed-${String(feedKey || "").replaceAll("_", "-")}`;
  const mapping = {
    badge: `${base}-badge`,
    dot: `${base}-dot`,
    statusLine: `${base}-statusline`,
    offlineState: `${base}-offline`,
    deviceName: `${base}-device-name`,
    fps: `${base}-fps`,
    lastFrame: `${base}-last-frame`,
  };
  return mapping[part] || base;
}

function liveSummaryElementId(part) {
  const mapping = {
    healthTitle: "live-summary-health-title",
    healthCopy: "live-summary-health-copy",
    sourceTitle: "live-summary-source-title",
    sourceCopy: "live-summary-source-copy",
    sessionTitle: "live-summary-session-title",
    sessionCopy: "live-summary-session-copy",
    detectionsCount: "live-summary-detections-count",
    detectionsCopy: "live-summary-detections-copy",
  };
  return mapping[part];
}

function liveActionElementId(action) {
  const mapping = {
    snapshot: "button-live-save-snapshot",
    record: "button-live-toggle-recording",
    aiPill: "live-status-pill-ai",
    aiDot: "live-ai-status-dot",
    aiLabel: "live-ai-status-label",
    sourceGrid: "live-source-grid",
    sourceSelectedBadge: "live-source-selected-badge",
    sourceRefreshButton: "button-live-refresh-sources",
    liveRefreshButton: "button-live-refresh",
    liveRefreshText: "live-refresh-status-text",
    thermalImage: "live-feed-thermal-image",
    missionBar: "live-mission-command-bar",
    missionIndicator: "live-mission-state-indicator",
    missionTitle: "live-mission-state-title",
    missionCopy: "live-mission-state-copy",
    captureTitle: "live-capture-feedback-title",
    captureLink: "live-capture-feedback-link",
    datasetStateBadge: "dataset-session-state-badge",
    datasetExplanation: "dataset-session-explanation",
    datasetHeadingLabel: "dataset-session-heading-label",
    datasetSessionId: "dataset-session-id",
    datasetSessionReference: "dataset-session-reference",
    datasetManifestPath: "dataset-manifest-path",
    datasetSamplesCount: "dataset-samples-count",
    datasetPairedCount: "dataset-paired-count",
    datasetSnapshotsCount: "dataset-snapshots-count",
    datasetInferenceCount: "dataset-inference-count",
    datasetDetectionsCount: "dataset-detections-count",
    datasetFeedBreakdown: "dataset-feed-breakdown",
    datasetValidateButton: "button-dataset-validate",
    datasetExportButton: "button-dataset-export",
    datasetExportDownload: "dataset-export-download",
    datasetExportFeedback: "dataset-export-feedback",
  };
  return mapping[action];
}

function humanMissionState(health, thermal, rgb, operations) {
  const sensors = operations.sensor_health || {};
  const thermalState = String(thermal.runtime_state?.availability || thermal.status || thermal.mode || "").toUpperCase();
  const rgbState = String(rgb.runtime_state?.availability || rgb.camera_state || "").toUpperCase();
  const readySensors = Number(sensors.ready_count ?? sensors.online_count ?? 0);

  if (health?.ok && readySensors >= 3 && !["ERROR", "FAILED", "OFFLINE", "NOT_PRESENT", "NOT_DETECTED"].includes(thermalState)) {
    return {
      title: "Mission ready",
      copy: "The primary sources are available and the dashboard can operate normally.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_PRESENT", "NOT_DETECTED"].includes(thermalState)) {
    return {
      title: "Check thermal sensor",
      copy: "The RGB cameras may be operational, but thermal confirmation is not yet reliable.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_PRESENT", "NOT_DETECTED"].includes(rgbState) || readySensors < 2) {
    return {
      title: "Live view incomplete",
      copy: "At least one visible source is not delivering stable frames. Restore it before proceeding.",
    };
  }
  return {
    title: "Quick check required",
    copy: "The system is almost ready, but verify the primary streams before opening a new session.",
  };
}

function updateCameraState(feedKey, state, message) {
  const tone = stateTone(state);
  const label = humanStateLabel(state);
  const feedType = String(feedKey).includes("thermal") ? "thermal" : "rgb";
  const dot = byId(liveFeedElementId(feedKey, "dot"));
  setBadge(liveFeedElementId(feedKey, "badge"), label, tone.badge);
  if (dot) {
    dot.classList.remove("state-dot-muted", "state-dot-error", "state-dot-warning", "state-dot-online", "state-dot-loading");
    if (tone.dot) dot.classList.add(tone.dot);
  }
}

function monitorDarkRgbFrames() {
  ["rgb_left", "rgb_right"].forEach((feedKey) => {
    const image = document.querySelector(`[data-feed-image="${feedKey}"]`);
    const note = byId(`live-feed-${feedKey.replaceAll("_", "-")}-dark-note`);
    if (!image || !note || image.dataset.darkFrameMonitor === "active") return;
    image.dataset.darkFrameMonitor = "active";
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 12;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const inspectFrame = () => {
      if (!context || !image.naturalWidth || image.classList.contains("is-hidden")) {
        note.hidden = true;
        return;
      }
      try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let luminance = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          luminance += (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
        }
        note.hidden = (luminance / (pixels.length / 4)) >= 14;
      } catch (_error) {
        note.hidden = true;
      }
    };
    inspectFrame();
    window.setInterval(inspectFrame, 5000);
  });
}

function renderAiCompactStatus(status, current) {
  const node = byId(liveActionElementId("aiLabel"));
  const dot = byId(liveActionElementId("aiDot"));
  const pill = byId(liveActionElementId("aiPill"));
  if (!node || !dot || !pill) return;
  const meta = aiStatusMeta(status, current);
  node.textContent = meta.label;
  pill.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
  dot.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
  pill.classList.add(`is-${meta.tone}`);
  dot.classList.add(`is-${meta.tone}`);
}

function renderLivePage(health) {
  const operations = health.operations || {};
  const rgb = health.rgb || {};
  const thermal = health.thermal || {};
  const cameras = health.cameras || {};
  const selectedSource = health.sources?.selected_source || {};
  const healthSession = health.session || {};
  const mission = humanMissionState(health, thermal, rgb, operations);
  const detectionCount = Number(health.detection_manager?.count || health.inference?.count || 0);
  const rgbCams = cameras.rgb_cameras || [];
  const rgbLeft = rgbCams[0] || {};
  const rgbRight = rgbCams[1] || {};
  const thermalCam = cameras.thermal_camera || {};
  const thermalVisual = thermalVisualState(thermal, thermalCam);
  monitorDarkRgbFrames();

  setText(liveSummaryElementId("healthTitle"), mission.title || "Needs attention");
  setText(liveSummaryElementId("healthCopy"), mission.copy || "Check the status of live sources.");
  setText(liveSummaryElementId("sourceTitle"), selectedSource.label || selectedSource.id || "Not selected");
  setText(liveSummaryElementId("sourceCopy"), selectedSource.description || selectedSource.state || "Select the active Frame Provider source in the panel below.");
  setText(liveSummaryElementId("sessionTitle"), healthSession.running ? "Running" : "Standby");
  setText(
    liveSummaryElementId("sessionCopy"),
    healthSession.running
      ? `Mission in progress · ${formatUptimeShort(healthSession.duration_seconds || 0)}`
      : "Start a session when you want to archive mission detections and events.",
  );
  setText(liveSummaryElementId("detectionsCount"), `${detectionCount}`);
  setText(
    liveSummaryElementId("detectionsCopy"),
    detectionCount > 0
      ? `The latest AI cycle produced ${detectionCount} detection${detectionCount === 1 ? "" : "s"}.`
      : "No current detections: replay is ready but has not produced useful results yet.",
  );

  [
    {
      key: "rgb_left",
      state: rgbLeft.state || rgb.camera_state || "LOADING",
      fps: rgbLeft.fps ?? rgb.fps ?? null,
      last: rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgbLeft.last_frame_ts || null,
      device: "No signal from the left camera",
      technicalDetail: rgbLeft.error || rgb.error || rgbLeft.hardware_name || "Arducam UC-517 LEFT",
      detected: Boolean(rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgbLeft.last_frame_ts),
    },
    {
      key: "thermal",
      state: thermalVisual.state,
      fps: thermal.fps ?? thermal.frame_rate ?? thermalCam.fps ?? null,
      last: thermalVisual.lastFrame,
      device: thermal.detected ? "No signal from the thermal camera" : "Thermal sensor not detected",
      technicalDetail: thermal.error || (thermal.detected ? `${thermal.device || "FLIR"} detected, but no frames are available` : "PureThermal video node not found. Check USB cable and v4l2-ctl --list-devices."),
      detected: thermalVisual.detected,
    },
    {
      key: "rgb_right",
      state: rgbRight.state || rgb.camera_state || "LOADING",
      fps: rgbRight.fps ?? rgb.fps ?? null,
      last: rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts || null,
      device: "No signal from the right camera",
      technicalDetail: rgbRight.error || rgb.error || rgbRight.hardware_name || "Arducam UC-517 RIGHT",
      detected: Boolean(rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts),
    },
  ].forEach((cardInfo) => {
    const hasFreshFrame = isFreshTimestamp(cardInfo.last);
    const tone = liveFeedTone(cardInfo.state, cardInfo.key, cardInfo.last, cardInfo.detected);
    const effectiveTone = cardInfo.key === "thermal" ? thermalVisual.tone : tone;
    const label = cardInfo.key === "thermal" ? thermalVisual.label : effectiveTone.offline ? "No signal" : humanStateLabel(cardInfo.state);
    const statusText = cardInfo.key === "thermal"
      ? thermalVisual.statusText
      : liveStatusText(cardInfo.key, cardInfo.state, cardInfo.fps, cardInfo.last, cardInfo.detected);
    const card = document.querySelector(`[data-feed="${cardInfo.key}"]`);
    const badgeTone = effectiveTone.badge === "loading" ? "loading" : effectiveTone.badge;
    setBadge(liveFeedElementId(cardInfo.key, "badge"), label, badgeTone);
    setText(liveFeedElementId(cardInfo.key, "statusLine"), statusText);
    setText(liveFeedElementId(cardInfo.key, "fps"), cardInfo.fps != null && Number.isFinite(Number(cardInfo.fps)) ? `${Number(cardInfo.fps).toFixed(1)} fps` : "--");
    setText(liveFeedElementId(cardInfo.key, "lastFrame"), cardInfo.last ? formatRomeTimeOnly(cardInfo.last) : "--");
    const offlineNode = byId(liveFeedElementId(cardInfo.key, "offlineState"));
    if (card) {
      card.classList.toggle("is-offline", Boolean(effectiveTone.offline));
      card.classList.toggle("is-loading", Boolean(effectiveTone.loading));
      card.classList.toggle("is-live", !effectiveTone.offline && !effectiveTone.loading);
    }
    if (offlineNode) offlineNode.hidden = !effectiveTone.offline;
    const deviceNode = byId(liveFeedElementId(cardInfo.key, "deviceName"));
    if (deviceNode) {
      deviceNode.textContent = cardInfo.device;
      if (cardInfo.technicalDetail) {
        deviceNode.title = cardInfo.technicalDetail;
        deviceNode.setAttribute("aria-label", `${cardInfo.device}. Technical detail: ${cardInfo.technicalDetail}`);
      } else {
        deviceNode.removeAttribute("title");
        deviceNode.removeAttribute("aria-label");
      }
    }
    const image = card ? card.querySelector("[data-feed-image], #live-feed-thermal-image") : null;
    if (image) {
      const hideImage = cardInfo.key === "thermal"
        ? Boolean(effectiveTone.offline || !thermalVisual.hasCachedFrame)
        : Boolean(effectiveTone.offline);
      image.classList.toggle("is-hidden", hideImage);
      if (cardInfo.key === "thermal" && thermalVisual.hasCachedFrame && !image.dataset.cachedFrameLoaded && !image.src) {
        image.dataset.cachedFrameLoaded = "true";
        image.src = `/thermal/last-frame?ts=${Date.now()}`;
      }
    }
  });

  const thermalReady = byId("live-feed-thermal-ready");
  if (thermalReady) thermalReady.hidden = Boolean(thermalVisual.hasCachedFrame || thermalVisual.tone.offline || thermalVisual.tone.loading);
  const thermalCaptureButton = byId("button-thermal-capture");
  if (thermalCaptureButton && !thermalCaptureButton.disabled) {
    const label = thermalCaptureButton.querySelector("span");
    if (label) label.textContent = thermalVisual.hasCachedFrame ? "Capture new thermal image" : "Capture thermal image";
  }

  const sessionStatus = dashboardState.sessionStatus || health.session || {};
  const session = sessionStatus.current || sessionStatus.session || null;
  const sessionRunning = Boolean(sessionStatus.running || session?.status === "RUNNING");
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const snapshotButton = byId(liveActionElementId("snapshot"));
  if (snapshotButton) {
    snapshotButton.dataset.primaryFeed = ["REAL", "LIVE", "READY"].includes(thermalState) ? "thermal" : "rgb_left";
    snapshotButton.disabled = !sessionRunning;
    snapshotButton.textContent = "Save sensor set";
    snapshotButton.title = sessionRunning
      ? "Save left RGB, right RGB and thermal data in the same sample"
      : "Available after the mission starts";
  }
  const recordButton = byId(liveActionElementId("record"));
  if (recordButton) {
    recordButton.disabled = false;
    recordButton.classList.toggle("btn-danger", sessionRunning);
    recordButton.classList.toggle("btn-primary", !sessionRunning);
    recordButton.textContent = sessionRunning ? "End mission" : "Start mission";
    recordButton.title = sessionRunning ? "End and archive the current mission" : "Start saving detections, events and metrics";
  }

  const captureFeedbackTitle = byId(liveActionElementId("captureTitle"));
  if (captureFeedbackTitle && !captureFeedbackTitle.dataset.actionFeedback) {
    captureFeedbackTitle.textContent = sessionRunning
      ? "Recording active · you can now save a sensor set"
      : sessionStatus.latest
        ? "Mission ended · you can review its history"
        : "Waiting to start";
  }

  const missionBar = byId(liveActionElementId("missionBar"));
  const missionIndicator = byId(liveActionElementId("missionIndicator"));
  if (missionBar) missionBar.classList.toggle("is-running", sessionRunning);
  if (missionIndicator) missionIndicator.classList.toggle("is-running", sessionRunning);
  setText(liveActionElementId("missionTitle"), sessionRunning ? "Mission recording" : "No active mission");
  setText(
    liveActionElementId("missionCopy"),
    sessionRunning
      ? `Mission in progress · ${formatUptimeShort(session?.metrics?.session_duration ?? session?.duration ?? 0)} · data saved on the Raspberry Pi`
      : "Start a mission to save detections, events and metrics on the Raspberry Pi.",
  );
  byId("mission-workflow-start")?.classList.toggle("is-complete", sessionRunning);
  byId("mission-workflow-capture")?.classList.toggle("is-current", sessionRunning);
  byId("mission-workflow-review")?.classList.toggle("is-current", !sessionRunning && Boolean(sessionStatus.latest));
  renderDatasetSessionPanel();
}

function renderDatasetSessionPanel() {
  const acquisition = dashboardState.acquisition || {};
  const sessionStatus = dashboardState.sessionStatus || {};
  const current = sessionStatus.current || null;
  const latest = sessionStatus.latest || null;
  const activeSession = current || latest || {};
  const running = Boolean(acquisition.running || sessionStatus.running || current?.status === "RUNNING");
  const manifestCounts = acquisition.manifest_counts || {};
  const datasetSummary = acquisition.dataset_summary || {};
  const byFeed = datasetSummary.by_feed || manifestCounts.by_feed || {};
  const sessionId = acquisition.session_id || activeSession.session_id || null;
  const manifestPath = acquisition.manifest_path || activeSession.manifest_path || "";

  setBadge(liveActionElementId("datasetStateBadge"), running ? "Active mission" : sessionId ? "Latest mission" : "Standby", running ? "online" : sessionId ? "warning" : "muted");
  setText(liveActionElementId("datasetHeadingLabel"), running ? "Current mission" : "Latest mission");
  setText(
    liveActionElementId("datasetExplanation"),
    running
      ? "Photos, sensor captures and AI results are being saved to this mission on the Raspberry Pi."
      : sessionId
        ? "These are the latest archived data. Start a new mission to continue collecting."
        : "Start a mission to create a manifest with photos, inference runs and RGB/thermal pairs.",
  );
  const missionDate = activeSession.start_time || activeSession.started_at || activeSession.created_at || null;
  setText(
    liveActionElementId("datasetSessionId"),
    running ? "Mission in progress" : missionDate ? `Mission · ${formatRomeDateTime(missionDate)}` : sessionId ? "Latest archived mission" : "No mission recorded",
  );
  setText(liveActionElementId("datasetSessionReference"), sessionId || "Not available");
  setText(
    liveActionElementId("datasetManifestPath"),
    manifestPath ? compactPath(manifestPath) : "The manifest will appear after the mission saves its first item.",
  );
  setText(liveActionElementId("datasetSamplesCount"), `${datasetSummary.samples ?? manifestCounts.samples ?? 0}`);
  setText(liveActionElementId("datasetPairedCount"), `${datasetSummary.synchronized_samples ?? manifestCounts.synchronized_samples ?? datasetSummary.paired_items ?? manifestCounts.paired_items ?? 0}`);
  setText(liveActionElementId("datasetSnapshotsCount"), `${manifestCounts.snapshots ?? 0}`);
  setText(liveActionElementId("datasetInferenceCount"), `${manifestCounts.inference ?? 0}`);
  setText(liveActionElementId("datasetDetectionsCount"), `${manifestCounts.detections ?? 0}`);

  const synchronizedSamples = Number(datasetSummary.synchronized_samples ?? manifestCounts.synchronized_samples ?? 0);
  const rgbImages = Number(byFeed.rgb_left ?? 0) + Number(byFeed.rgb_right ?? 0);
  const thermalImages = Number(byFeed.thermal ?? 0);
  const datasetReady = Boolean(sessionId && synchronizedSamples > 0 && rgbImages > 0 && thermalImages > 0);
  const validateButton = byId(liveActionElementId("datasetValidateButton"));
  const exportButton = byId(liveActionElementId("datasetExportButton"));
  [validateButton, exportButton].forEach((button) => {
    if (!button) return;
    button.disabled = !datasetReady;
    button.title = datasetReady
      ? "This mission contains at least one synchronized RGB and thermal sample"
      : "Save at least one sensor set containing RGB and thermal data before continuing";
  });
  if (!datasetReady) {
    setText(
      liveActionElementId("datasetExportFeedback"),
      sessionId
        ? "Dataset not ready · save at least one synchronized RGB + thermal sensor set during a mission."
        : "Start a mission and save a sensor set before validating or exporting a dataset.",
    );
  }

  const feedLabels = {
    rgb_left: "Left RGB",
    rgb_right: "Right RGB",
    thermal: "Thermal",
  };
  const node = byId(liveActionElementId("datasetFeedBreakdown"));
  if (node) {
    node.innerHTML = Object.entries(feedLabels).map(([feed, label]) => `
      <span class="dataset-feed-pill">${escapeHtml(label)}: <strong>${escapeHtml(String(byFeed[feed] || 0))}</strong></span>
    `).join("");
  }
}

function renderMissionHistory(sessions) {
  const list = byId("mission-history-list");
  if (!list) return;
  const items = Array.isArray(sessions)
    ? sessions.slice().sort((left, right) => new Date(right.start_time || 0) - new Date(left.start_time || 0))
    : [];
  setText("mission-history-count", `${items.length} mission${items.length === 1 ? "" : "s"}`);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No archived missions.</div>';
    return;
  }
  list.innerHTML = items.map((session, index) => {
    const sessionId = String(session.session_id || "");
    const running = String(session.status || "").toUpperCase() === "RUNNING";
    return `<button class="mission-history-row${index === 0 ? " is-active" : ""}" type="button" data-mission-history-id="${escapeHtml(sessionId)}" aria-pressed="${index === 0 ? "true" : "false"}"><span><strong>${escapeHtml(formatRomeDateTime(session.start_time))}</strong><small>${running ? "Currently recording" : "Recorded mission"}</small></span><span><span class="badge badge-${running ? "online" : "muted"}">${running ? "Running" : "Archived"}</span><small>${escapeHtml(formatSessionDuration(session.duration))}</small></span></button>`;
  }).join("");
}

function renderMissionHistoryDetail(session, manifest) {
  const detail = byId("mission-history-detail");
  if (!detail) return;
  const counts = manifest?.counts || {};
  const byFeed = counts.by_feed || {};
  const sessionId = String(session?.session_id || manifest?.session_id || "");
  detail.innerHTML = `
    <div class="mission-history-detail-head">
      <span class="mission-data-label">Selected mission</span>
      <strong>${escapeHtml(formatRomeDateTime(session?.start_time))}</strong>
      <p>${String(session?.status || "").toUpperCase() === "RUNNING" ? "Currently recording" : "Archived mission"} · ${escapeHtml(formatSessionDuration(session?.duration))}</p>
    </div>
    <dl class="mission-history-counts">
      <div><dt>Samples</dt><dd>${escapeHtml(String(counts.samples || 0))}</dd></div>
      <div><dt>Photos</dt><dd>${escapeHtml(String(counts.snapshots || 0))}</dd></div>
      <div><dt>Inference runs</dt><dd>${escapeHtml(String(counts.inference || 0))}</dd></div>
      <div><dt>Detections</dt><dd>${escapeHtml(String(counts.detections || 0))}</dd></div>
    </dl>
    <div class="mission-history-feeds">
      <span>Left RGB <strong>${escapeHtml(String(byFeed.rgb_left || 0))}</strong></span>
      <span>Right RGB <strong>${escapeHtml(String(byFeed.rgb_right || 0))}</strong></span>
      <span>Thermal <strong>${escapeHtml(String(byFeed.thermal || 0))}</strong></span>
    </div>
    <details class="mission-history-reference"><summary>Technical reference</summary><code>${escapeHtml(sessionId || "Not available")}</code></details>
    <p class="mission-history-feedback" id="mission-history-feedback">${manifest?.ok === false ? "Manifest unavailable for this mission." : "Manifest loaded: you can validate the dataset or export it."}</p>
    <div class="mission-history-actions">
      <button class="btn btn-ghost btn-small" type="button" data-history-validate="${escapeHtml(sessionId)}">Validate dataset</button>
      <button class="btn btn-secondary btn-small" type="button" data-history-export="${escapeHtml(sessionId)}">Export ZIP</button>
      <a class="panel-link" href="/snapshots">View photos</a>
    </div>`;
}

async function loadMissionHistory() {
  if (dashboardState.page !== "mission") return;
  const response = await DashboardApi.request("/api/session/list");
  dashboardState.sessionHistory = response.data?.sessions || [];
  renderMissionHistory(dashboardState.sessionHistory);
  const latest = dashboardState.sessionHistory
    .slice()
    .sort((left, right) => new Date(right.start_time || 0) - new Date(left.start_time || 0))[0];
  if (latest?.session_id) {
    const manifestResponse = await DashboardApi.request(`/api/session/manifest?session_id=${encodeURIComponent(latest.session_id)}`);
    renderMissionHistoryDetail(latest, manifestResponse.data || {});
  }
}

function setupLivePage() {
  const thermalCaptureButton = byId("button-thermal-capture");
  if (thermalCaptureButton) {
    thermalCaptureButton.addEventListener("click", async () => {
      thermalCaptureButton.disabled = true;
      const label = thermalCaptureButton.querySelector("span");
      if (label) label.textContent = "Capturing thermal image…";
      try {
        reloadThermalFrame();
      } finally {
        window.setTimeout(() => {
          thermalCaptureButton.disabled = false;
          if (label) label.textContent = "Capture new thermal image";
        }, 3500);
      }
    });
  }
  const liveRefreshButton = byId(liveActionElementId("liveRefreshButton"));
  if (liveRefreshButton) {
    liveRefreshButton.addEventListener("click", async () => {
      liveRefreshButton.disabled = true;
      const label = liveRefreshButton.querySelector("span");
      if (label) label.textContent = "Checking…";
      await refreshDashboard();
      setText(liveActionElementId("liveRefreshText"), `Status updated at ${formatRomeTimeOnly(Date.now())}`);
      window.setTimeout(() => {
        liveRefreshButton.disabled = false;
        if (label) label.textContent = "Check sensors";
      }, 350);
    });
  }

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
      liveSnapshotButton.disabled = true;
      const originalLabel = liveSnapshotButton.textContent;
      liveSnapshotButton.textContent = "Saving…";
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
      try {
        if (dashboardState.sessionStatus?.running) {
          const payload = await callInferenceAction("/api/acquisition/capture-set", {});
          const saved = Number(payload?.successful_feeds || 0);
          const total = Number(payload?.total_feeds || 3);
          const complete = Boolean(payload?.complete);
          showToast(
            complete ? "Capture set saved" : "Partial capture set",
            `${saved}/${total} sources saved in the same sample.`,
            complete ? "success" : "info",
            "/snapshots",
          );
          const feedbackTitle = byId(liveActionElementId("captureTitle"));
          const feedbackLink = byId(liveActionElementId("captureLink"));
          if (feedbackTitle) feedbackTitle.textContent = `${saved}/${total} sources · same sample`;
          if (feedbackLink) {
            feedbackLink.href = "/snapshots";
            feedbackLink.hidden = false;
          }
          await refreshDashboard();
        } else {
          await snapshot(preferredFeed);
        }
      } finally {
        liveSnapshotButton.disabled = false;
        liveSnapshotButton.textContent = originalLabel;
      }
    });
  }

  const liveRecordButton = byId(liveActionElementId("record"));
  if (liveRecordButton) {
    liveRecordButton.addEventListener("click", async () => {
      liveRecordButton.disabled = true;
      const sessionStatus = dashboardState.sessionStatus || {};
      const session = sessionStatus.current || sessionStatus.session || null;
      const running = Boolean(sessionStatus.running || session?.status === "RUNNING");
      try {
        if (running) {
          await callInferenceAction("/api/session/stop");
          showToast("Mission archived", "Detections, events and metrics were saved on the Raspberry Pi.", "success");
        } else {
          const payload = await callInferenceAction("/api/session/start", { mode: "live", operator: "dashboard" });
          const sessionId = payload?.session?.session_id;
          showToast("Mission started", sessionId ? "A new mission archive is now recording." : "Operational recording is active.", "success");
        }
        const inlineFeedback = byId(liveActionElementId("captureTitle"));
        if (inlineFeedback) {
          inlineFeedback.dataset.actionFeedback = "true";
          inlineFeedback.textContent = running
            ? "Mission ended and archived"
            : "Mission started · save the first sensor set";
        }
        await refreshDashboard();
        await loadMissionHistory();
      } catch (error) {
        console.error(error);
        showToast("Operation failed", error.message || "Unable to update the mission", "error");
      } finally {
        liveRecordButton.disabled = false;
      }
    });
  }

  const datasetValidateButton = byId(liveActionElementId("datasetValidateButton"));
  if (datasetValidateButton) {
    datasetValidateButton.addEventListener("click", async () => {
      datasetValidateButton.disabled = true;
      try {
        const response = await DashboardApi.request("/api/dataset/validate");
        const payload = response.data || {};
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Dataset unavailable");
        setText(
          liveActionElementId("datasetExportFeedback"),
          payload.valid
            ? `${payload.valid_samples} valid samples · ${payload.incomplete_samples} incomplete · ${payload.excluded_items} excluded files.`
            : `No complete samples · ${payload.incomplete_samples} incomplete · ${payload.excluded_items} excluded files.`,
        );
        showToast(payload.valid ? "Valid dataset" : "Incomplete dataset", payload.valid ? "You can create the ZIP package." : "Check the missing feeds.", payload.valid ? "success" : "info");
      } catch (error) {
        setText(liveActionElementId("datasetExportFeedback"), error.message || "Validation failed");
        showToast("Validation failed", error.message || "Dataset unavailable", "error");
      } finally {
        datasetValidateButton.disabled = false;
      }
    });
  }

  const datasetExportButton = byId(liveActionElementId("datasetExportButton"));
  if (datasetExportButton) {
    datasetExportButton.addEventListener("click", async () => {
      datasetExportButton.disabled = true;
      datasetExportButton.textContent = "Exporting…";
      try {
        const payload = await callInferenceAction("/api/dataset/export", { validation_percent: 20 });
        setText(liveActionElementId("datasetExportFeedback"), `${payload.counts.samples} samples and ${payload.counts.images} images exported.`);
        const download = byId(liveActionElementId("datasetExportDownload"));
        if (download) download.hidden = false;
        showToast("Dataset exported", "The ZIP package is ready.", "success", "/api/dataset/export/download");
      } catch (error) {
        setText(liveActionElementId("datasetExportFeedback"), error.message || "Export failed");
        showToast("Export failed", error.message || "No valid samples", "error");
      } finally {
        datasetExportButton.disabled = false;
        datasetExportButton.textContent = "Export ZIP";
      }
    });
  }
}
