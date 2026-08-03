function detectionsElementId(part) {
  const mapping = {
    aiModel: "detections-ai-model-name",
    aiBadge: "detections-ai-status-badge",
    aiTiming: "detections-ai-last-run",
    aiStartButton: "button-ai-start",
    aiStopButton: "button-ai-stop",
    aiRunDemoButton: "button-ai-run-demo",
    aiRefreshButton: "button-ai-refresh",
    frameProviderHelper: "frame-provider-helper-copy",
    frameProviderSourceType: "frame-provider-source-type",
    frameProviderSourcePath: "frame-provider-source-path",
    frameProviderStatus: "frame-provider-status",
    frameProviderFrameId: "frame-provider-current-frame-id",
    frameProviderFrameIndex: "frame-provider-current-frame-index",
    frameProviderTotalFrames: "frame-provider-total-frames",
    sessionTitle: "session-summary-title",
    sessionHelper: "session-summary-helper-copy",
    sessionStartButton: "button-session-start",
    sessionStopButton: "button-session-stop",
    sessionId: "session-info-id",
    sessionStatus: "session-info-status",
    sessionStartTime: "session-info-start-time",
    sessionDuration: "session-info-duration",
    sessionModel: "session-info-model",
    sessionMode: "session-info-mode",
    sessionTotalDetections: "session-metric-total-detections",
    sessionTotalEvents: "session-metric-total-events",
    sessionActiveEvents: "session-metric-active-events",
    sessionBoatCount: "session-metric-boat-count",
    sessionShipCount: "session-metric-ship-count",
    sessionBuoyCount: "session-metric-buoy-count",
    currentEventsBadge: "events-current-count-badge",
    currentEventsGrid: "events-current-grid",
    currentEventsEmpty: "events-current-empty-state",
    eventsTimeline: "events-timeline-list",
    eventsTimelineEmpty: "events-timeline-empty",
    detectionsBadge: "detections-summary-count-badge",
    detectionsTableShell: "detections-table-container",
    detectionsTableRows: "detections-table-rows",
    detectionsEmpty: "detections-table-empty-state",
    detectionsTotal: "detections-metric-total",
    detectionsAverageConfidence: "detections-metric-average-confidence",
    detectionsLatest: "detections-metric-latest",
    aiPreviewPanel: "detections-ai-preview-panel",
    aiPreviewCount: "detections-ai-preview-count",
    aiDetectionList: "detections-ai-list",
    aiPreviewImage: "detections-ai-preview-image",
    aiPreviewEmpty: "detections-ai-preview-empty",
    monitorTitle: "analysis-monitor-title",
    monitorCopy: "analysis-monitor-copy",
    monitorIndicator: "analysis-monitor-indicator",
    monitorSource: "analysis-monitor-source",
    monitorProgress: "analysis-monitor-progress",
    monitorProgressBar: "analysis-progress-bar",
    monitorLastFrame: "analysis-monitor-last-frame",
    monitorResults: "analysis-monitor-results",
  };
  return mapping[part];
}

function renderAiDetections(status, current) {
  const list = byId(detectionsElementId("aiDetectionList"));
  const countNode = byId(detectionsElementId("aiPreviewCount"));
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
  if (!detections.length) return;

  detections.slice(0, 6).forEach((detection) => {
    const card = document.createElement("article");
    card.className = "ai-detection-card";
    const confidence = aiConfidencePercent(detection?.confidence);
    const confidenceDisplay = Number.isFinite(confidence) ? `${Math.round(confidence)}%` : "—";
    const confidenceTone = detectionConfidenceTone(detection?.confidence);
    const sourceLabel = aiSourceLabel(current || status, detection);
    const imagePath = current?.last_image || status?.last_image || detection?.image_path || "";
    card.innerHTML = `
      <strong>${escapeHtml(detection?.class_name || detection?.label || "Detection")}</strong>
      <p>${escapeHtml(formatAiBBox(detection?.box_xyxy || detection?.bbox || detection?.xyxy))}</p>
      <div class="ai-detection-meta">
        <span class="badge badge-${confidenceTone} detection-confidence">Confidence ${escapeHtml(confidenceDisplay)}</span>
        <span class="badge badge-muted">Source ${escapeHtml(sourceLabel)}</span>
      </div>
      <small title="${escapeHtml(imagePath)}">${escapeHtml(compactPath(imagePath || detection?.source || "runtime/sessions"))}</small>
    `;
    list.appendChild(card);
  });
}

function renderAiPreview(status, current) {
  const panel = byId(detectionsElementId("aiPreviewPanel"));
  const img = byId(detectionsElementId("aiPreviewImage"));
  const empty = byId(detectionsElementId("aiPreviewEmpty"));
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

function renderAiControlButtons(status, current) {
  const meta = aiStatusMeta(status, current);
  const startButton = byId(detectionsElementId("aiStartButton"));
  const stopButton = byId(detectionsElementId("aiStopButton"));
  const runButton = byId(detectionsElementId("aiRunDemoButton"));
  const refreshButton = byId(detectionsElementId("aiRefreshButton"));
  const isRunning = meta.label === "RUNNING";
  const isDemo = meta.label === "DEMO";
  if (startButton) {
    startButton.hidden = isRunning || isDemo;
    startButton.textContent = status?.last_run_ts ? "Resume analysis" : "Start analysis";
  }
  if (stopButton) stopButton.hidden = !(isRunning || isDemo);
  if (runButton) runButton.hidden = !isRunning;
  if (refreshButton) refreshButton.hidden = !(isRunning || isDemo);
}

function renderAiPanel(status, current) {
  const effectiveStatus = status || {};
  const effectiveCurrent = current || {};
  const meta = aiStatusMeta(effectiveStatus, effectiveCurrent);
  const running = Boolean(effectiveStatus.running);
  const error = effectiveCurrent?.error || effectiveStatus?.error || effectiveStatus?.config_error || "";
  const badgeNode = byId(detectionsElementId("aiBadge"));
  if (badgeNode?.classList.contains("ai-control-state")) {
    badgeNode.textContent = meta.label;
    badgeNode.classList.remove("is-running", "is-demo", "is-idle", "is-error", "is-unknown");
    badgeNode.classList.add(`is-${meta.tone}`);
  } else {
    setBadge(detectionsElementId("aiBadge"), meta.label, error ? "error" : running ? "online" : "muted");
  }
  setText(detectionsElementId("aiModel"), String(effectiveStatus.model_path || "").split("/").pop() || "easy_v1_best_rgb.onnx");
  setText(
    detectionsElementId("aiTiming"),
    running || effectiveStatus.last_inference_ms != null
      ? `${effectiveStatus.last_inference_ms != null ? `${Number(effectiveStatus.last_inference_ms).toFixed(0)}ms` : "--"} · ${effectiveStatus.fps != null ? `${Number(effectiveStatus.fps).toFixed(1)} FPS` : "--"}`
      : "--",
  );
  renderAiControlButtons(effectiveStatus, effectiveCurrent);
  renderAiDetections(effectiveStatus, effectiveCurrent);
  renderAiPreview(effectiveStatus, effectiveCurrent);
  renderAnalysisMonitor(effectiveStatus, effectiveCurrent);
  renderAnalysisSourceMode(effectiveStatus, effectiveCurrent);
}

function renderAnalysisSourceMode(status, current) {
  const container = byId("analysis-source-mode");
  const badge = byId("analysis-source-mode-badge");
  const copy = byId("analysis-source-mode-copy");
  if (!container || !badge || !copy) return;
  const provider = status?.frame_provider || dashboardState.frameProviderStatus || {};
  const source = String(current?.source_label || current?.source || status?.source_label || status?.source || provider.source_type || "").toLowerCase();
  const isDemo = ["replay", "demo", "manual"].some((token) => source.includes(token));
  const isLive = ["rgb_left", "rgb_right", "camera", "live"].some((token) => source.includes(token));
  badge.className = `badge badge-${isDemo ? "warning" : isLive ? "online" : "muted"}`;
  badge.textContent = isDemo ? "Demo mode" : isLive ? "Live analysis" : "Checking source";
  copy.textContent = isDemo
    ? "Analysis uses sample images, not live cameras."
    : isLive
      ? "Processing the selected live camera."
      : "Checking whether analysis is using replay data or a live camera.";
}

function renderAnalysisMonitor(status, current) {
  const running = Boolean(status?.running);
  const error = current?.error || status?.error || status?.config_error || "";
  const provider = status?.frame_provider || dashboardState.frameProviderStatus || {};
  const lastFrame = provider.last_frame || status?.last_frame || {};
  const rawFrameIndex = lastFrame.frame_index ?? provider.current_frame_index;
  const frameIndex = rawFrameIndex == null ? Number.NaN : Number(rawFrameIndex);
  const totalFrames = Number(provider.total_frames ?? status?.available_images);
  const resultCount = Number(current?.count ?? status?.count ?? 0);
  const source = status?.source_label || provider.source_type || "—";
  const hasProgress = Number.isFinite(frameIndex) && Number.isFinite(totalFrames) && totalFrames > 0;
  const progress = hasProgress ? Math.min(100, Math.max(0, ((frameIndex + 1) / totalFrames) * 100)) : 0;
  const hasPreviousRun = Boolean(status?.last_run_ts);

  let title = "Analysis stopped";
  let copy = "Press “Start analysis”: a mission will open and frames will be processed in sequence.";
  let indicator = "WAITING";
  if (error) {
    title = "Analysis unavailable";
    copy = error;
    indicator = "ERROR";
  } else if (running) {
    title = "Analysis running";
    copy = resultCount
      ? `The AI engine is running: ${resultCount} objects in the latest processed frame.`
      : "The AI engine is active and looking for objects. Zero results is a valid outcome.";
    indicator = "ACTIVE";
  } else if (status?.last_run_ts) {
    title = "Analysis completed or paused";
    copy = `Latest frame processed ${formatAgeIt(parseDateValue(status.last_run_ts) / 1000)}. You can resume analysis at any time.`;
    indicator = "PAUSED";
  }

  setText(detectionsElementId("monitorTitle"), title);
  setText(detectionsElementId("monitorCopy"), copy);
  setText(detectionsElementId("monitorIndicator"), indicator);
  setText(detectionsElementId("monitorSource"), source);
  setText(detectionsElementId("monitorProgress"), hasProgress ? `${frameIndex + 1} of ${totalFrames}` : running ? "Continuous stream" : "—");
  setText(detectionsElementId("monitorLastFrame"), status?.last_run_ts ? formatRomeDateTime(status.last_run_ts) : "Not analysed yet");
  setText(detectionsElementId("monitorResults"), `${resultCount}`);

  const indicatorNode = byId(detectionsElementId("monitorIndicator"));
  if (indicatorNode) {
    indicatorNode.classList.toggle("is-running", running && !error);
    indicatorNode.classList.toggle("is-error", Boolean(error));
  }
  const bar = byId(detectionsElementId("monitorProgressBar"));
  if (bar) {
    bar.style.width = `${running && !hasProgress ? 100 : progress}%`;
    bar.classList.toggle("is-indeterminate", running && !hasProgress);
  }

  const flowSource = byId("analysis-flow-source");
  const flowRun = byId("analysis-flow-run");
  const flowReview = byId("analysis-flow-review");
  [flowSource, flowRun, flowReview].forEach((node) => node?.classList.remove("is-current", "is-complete"));
  flowSource?.classList.add("is-complete");
  if (running) {
    flowRun?.classList.add("is-current");
  } else if (hasPreviousRun) {
    flowRun?.classList.add("is-complete");
    flowReview?.classList.add("is-current");
  } else {
    flowRun?.classList.add("is-current");
  }
}

function renderSessionPanel(status) {
  const payload = status || {};
  const session = payload.current || payload.session || payload.latest || null;
  const running = Boolean(payload.running || session?.status === "RUNNING");
  const metrics = session?.metrics || {};
  const title = byId(detectionsElementId("sessionTitle"));
  const helper = byId(detectionsElementId("sessionHelper"));
  const startButton = byId(detectionsElementId("sessionStartButton"));
  const stopButton = byId(detectionsElementId("sessionStopButton"));
  const statusNode = byId(detectionsElementId("sessionStatus"));

  if (title) title.textContent = session ? (running ? "Mission recording" : "Latest archived mission") : "No active mission";
  if (helper) {
    helper.textContent = session
      ? `Archived mission from ${formatRomeDateTime(session.start_time)} · data is stored on the Raspberry Pi.`
      : "Start a mission to save detections, events and metrics on the Raspberry Pi.";
  }
  if (startButton) startButton.hidden = running;
  if (stopButton) stopButton.hidden = !running;

  setText(detectionsElementId("sessionId"), session?.start_time ? formatRomeDateTime(session.start_time) : "—");
  setText(detectionsElementId("sessionStatus"), session?.status || "IDLE");
  setText(detectionsElementId("sessionStartTime"), session?.start_time ? formatRomeTimeOnly(session.start_time) : "—");
  setText(detectionsElementId("sessionDuration"), formatSessionDuration(metrics.session_duration ?? session?.duration));
  setText(detectionsElementId("sessionModel"), session?.model_name || "—");
  setText(detectionsElementId("sessionMode"), session?.mode || "—");
  setText(detectionsElementId("sessionTotalDetections"), `${metrics.total_detections ?? 0}`);
  setText(detectionsElementId("sessionTotalEvents"), `${metrics.total_events ?? 0}`);
  setText(detectionsElementId("sessionActiveEvents"), `${metrics.active_events ?? 0}`);
  setText(detectionsElementId("sessionBoatCount"), `${metrics.boat_count ?? 0}`);
  setText(detectionsElementId("sessionShipCount"), `${metrics.ship_count ?? 0}`);
  setText(detectionsElementId("sessionBuoyCount"), `${metrics.buoy_count ?? 0}`);

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
  const state = payload.error ? "ERROR" : payload.ok === false ? "LIMITED" : "READY";

  setText(detectionsElementId("frameProviderSourceType"), sourceType);
  setText(detectionsElementId("frameProviderSourcePath"), sourcePath ? compactPath(String(sourcePath)) : "—");
  setText(detectionsElementId("frameProviderStatus"), state);
  setText(detectionsElementId("frameProviderFrameId"), lastFrame.frame_id || payload.current_frame_id || "—");
  setText(detectionsElementId("frameProviderFrameIndex"), frameIndex == null ? "—" : `${frameIndex}`);
  setText(detectionsElementId("frameProviderTotalFrames"), totalFrames == null ? "—" : `${totalFrames}`);

  const helper = byId(detectionsElementId("frameProviderHelper"));
  if (helper) {
    helper.textContent = payload.error
      ? payload.error
      : `Source ${sourceType} is ready. The next frame can be sent to AI analysis.`;
  }
}

function renderCurrentEventsPanel() {
  const grid = byId(detectionsElementId("currentEventsGrid"));
  const empty = byId(detectionsElementId("currentEventsEmpty"));
  const badge = byId(detectionsElementId("currentEventsBadge"));
  if (!grid) return;
  const events = sortEventsByLatest(dashboardState.currentEvents);
  if (badge) badge.textContent = `${events.length} events`;
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
        <span class="badge badge-severity-${severityTone}">${escapeHtml(eventSeverityLabel(event?.severity))}</span>
      </div>
      <div class="event-card-meta">
        <span class="badge badge-status-${statusTone}">${escapeHtml(eventStatusLabel(event?.status))}</span>
        <span class="badge badge-muted">${escapeHtml(eventSourceLabel(event))}</span>
      </div>
      <div class="event-card-times">
        <span>Created ${escapeHtml(formatRomeDateTime(event?.created_at || event?.timestamp))}</span>
        <span>Updated ${escapeHtml(formatRomeDateTime(event?.updated_at || event?.last_timestamp))}</span>
      </div>
      <div class="event-card-updates">${escapeHtml(eventUpdateLabel(event))}</div>
    `;
    grid.appendChild(card);
  });
  updateAnalysisEventsEmptyState();
}

function renderEventTimeline() {
  const timeline = byId(detectionsElementId("eventsTimeline"));
  const empty = byId(detectionsElementId("eventsTimelineEmpty"));
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
    row.className = `event-card timeline-event-card is-${severityTone}`;
    row.innerHTML = `
      <div class="event-card-head">
        <span class="event-card-title">${typeMeta.icon}<span>${escapeHtml(typeMeta.label)}</span></span>
        <span class="badge badge-severity-${severityTone}">${escapeHtml(eventSeverityLabel(event?.severity))}</span>
      </div>
      <div class="event-card-meta timeline-event-meta">
        <span><time>${escapeHtml(formatRomeDateTime(event?.updated_at || event?.created_at || event?.timestamp))}</time> · ${escapeHtml(eventSourceLabel(event))}</span>
        <span class="badge badge-status-${statusTone}">${escapeHtml(eventStatusLabel(event?.status))}</span>
      </div>
      <div class="event-card-updates">${escapeHtml(eventUpdateLabel(event))}</div>
    `;
    timeline.appendChild(row);
  });
  updateAnalysisEventsEmptyState();
}

function updateAnalysisEventsEmptyState() {
  const empty = byId("analysis-events-empty-state");
  if (!empty) return;
  const hasCurrent = Array.isArray(dashboardState.currentEvents) && dashboardState.currentEvents.length > 0;
  const hasHistory = Array.isArray(dashboardState.eventHistory) && dashboardState.eventHistory.length > 0;
  const hasEvents = hasCurrent || hasHistory;
  empty.hidden = hasEvents;
  empty.closest(".analysis-events-column")?.classList.toggle("is-empty", !hasEvents);
}

function renderDetectionsPage(health) {
  const container = byId(detectionsElementId("detectionsTableRows"));
  const tableShell = byId(detectionsElementId("detectionsTableShell"));
  const emptyState = byId(detectionsElementId("detectionsEmpty"));
  const badge = byId(detectionsElementId("detectionsBadge"));
  const totalNode = byId(detectionsElementId("detectionsTotal"));
  const avgNode = byId(detectionsElementId("detectionsAverageConfidence"));
  const latestNode = byId(detectionsElementId("detectionsLatest"));
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
          <td><span class="detection-type">${meta.icon}<span>${escapeHtml(meta.label)}</span></span></td>
          <td><span class="detection-coordinate">${escapeHtml(detectionCoordinateLabel(item))}</span></td>
          <td>${escapeHtml(detectionDistanceLabel(item?.distance_m ?? item?.distance))}</td>
          <td><span class="badge badge-${detectionConfidenceTone(item?.confidence)} detection-confidence">${escapeHtml(detectionConfidenceLabel(item?.confidence))}</span></td>
          <td><span class="detection-time">${escapeHtml(detectionTimestampLabel(item?.timestamp || item?.created || item?.ts))}</span></td>
          <td><span class="badge ${escapeHtml(sourceBadge.className)} detection-source">${escapeHtml(sourceBadge.label)}</span></td>
        `;
        container.appendChild(row);
      });
    } else if (tableShell) {
      tableShell.hidden = true;
    }
  }

  const totalCount = liveDetections.length;
  const confidenceValues = liveDetections.map((item) => aiConfidencePercent(item?.confidence)).filter((value) => Number.isFinite(value));
  const avgConfidence = confidenceValues.length ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) : null;
  const latest = liveDetections[0] || null;

  if (badge) badge.textContent = `${totalCount} objects`;
  if (totalNode) totalNode.textContent = `${totalCount}`;
  if (avgNode) avgNode.textContent = avgConfidence == null ? "—" : `${avgConfidence}%`;
  if (latestNode) latestNode.textContent = latest ? detectionTimestampLabel(latest.timestamp || latest.created || latest.ts) : "—";
  if (emptyState) emptyState.hidden = totalCount > 0 && filtered.length > 0;
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
      aiStartButton.textContent = "Starting…";
      let openedSession = false;
      try {
        if (!dashboardState.sessionStatus?.running) {
          await callInferenceAction("/api/session/start", { mode: "replay", operator: "dashboard" });
          openedSession = true;
        }
        await callInferenceAction("/api/inference/start", { mode: "replay" });
        showToast("Analysis started", "Mission opened: frames are processed and saved automatically.", "success");
        await refreshDashboard();
      } catch (error) {
        console.error(error);
        if (openedSession) {
          try {
            await callInferenceAction("/api/session/stop");
          } catch (cleanupError) {
            console.error(cleanupError);
          }
        }
        showToast("Analysis did not start", error.message || "The AI engine is unavailable", "error");
        await refreshDashboard();
      } finally {
        aiStartButton.disabled = false;
        aiStartButton.textContent = dashboardState.inferenceStatus?.last_run_ts ? "Resume analysis" : "Start analysis";
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
        showToast("Mission started", "Detections, events and metrics are now saved on the Raspberry Pi.", "success");
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
        showToast("Mission archived", "The mission has ended and its data remains available on the Raspberry Pi.", "success");
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
