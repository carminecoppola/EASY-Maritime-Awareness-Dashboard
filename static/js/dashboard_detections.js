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
  if (startButton) startButton.hidden = isRunning || isDemo;
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

  let title = "Analisi ferma";
  let copy = "Premi “Avvia analisi”: verrà aperta una missione e i frame saranno elaborati in sequenza.";
  let indicator = "IN ATTESA";
  if (error) {
    title = "Analisi non disponibile";
    copy = error;
    indicator = "ERRORE";
  } else if (running) {
    title = "Analisi in esecuzione";
    copy = resultCount
      ? `Il motore AI sta continuando: ${resultCount} oggetti nell’ultimo frame elaborato.`
      : "Il motore AI è attivo e sta cercando oggetti. Zero risultati è un esito valido.";
    indicator = "ATTIVA";
  } else if (status?.last_run_ts) {
    title = "Analisi completata o in pausa";
    copy = `Ultimo frame elaborato ${formatAgeIt(parseDateValue(status.last_run_ts) / 1000)}. Puoi riavviare l’analisi quando vuoi.`;
    indicator = "PAUSA";
  }

  setText(detectionsElementId("monitorTitle"), title);
  setText(detectionsElementId("monitorCopy"), copy);
  setText(detectionsElementId("monitorIndicator"), indicator);
  setText(detectionsElementId("monitorSource"), source);
  setText(detectionsElementId("monitorProgress"), hasProgress ? `${frameIndex + 1} di ${totalFrames}` : running ? "Flusso continuo" : "—");
  setText(detectionsElementId("monitorLastFrame"), status?.last_run_ts ? formatRomeTimeOnly(status.last_run_ts) : "Non ancora analizzato");
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

  if (title) title.textContent = session ? (running ? "Missione in registrazione" : "Ultima missione archiviata") : "Nessuna missione attiva";
  if (helper) {
    helper.textContent = session
      ? `${session.session_id || "Sessione EASY"} · i dati sono salvati nell’archivio runtime della Raspberry.`
      : "Avvia una missione per salvare rilevazioni, eventi e metriche sulla Raspberry.";
  }
  if (startButton) startButton.hidden = running;
  if (stopButton) stopButton.hidden = !running;

  setText(detectionsElementId("sessionId"), session?.session_id || "—");
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
  const state = payload.error ? "ERRORE" : payload.ok === false ? "LIMITATO" : "PRONTA";

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
      : `Sorgente ${sourceType} pronta. Il prossimo frame può essere inviato all’analisi AI.`;
  }
}

function renderCurrentEventsPanel() {
  const grid = byId(detectionsElementId("currentEventsGrid"));
  const empty = byId(detectionsElementId("currentEventsEmpty"));
  const badge = byId(detectionsElementId("currentEventsBadge"));
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
        <span>Creato ${escapeHtml(formatRomeTimeOnly(event?.created_at || event?.timestamp))}</span>
        <span>Aggiornato ${escapeHtml(formatRomeTimeOnly(event?.updated_at || event?.last_timestamp))}</span>
      </div>
      <div class="event-card-updates">${escapeHtml(eventUpdateLabel(event))}</div>
    `;
    grid.appendChild(card);
  });
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

  if (badge) badge.textContent = `${totalCount} oggetti`;
  if (totalNode) totalNode.textContent = `${totalCount}`;
  if (avgNode) avgNode.textContent = avgConfidence == null ? "—" : `${avgConfidence}%`;
  if (latestNode) latestNode.textContent = latest ? detectionTimestampLabel(latest.timestamp || latest.created || latest.ts) : "—";
  if (emptyState) emptyState.hidden = totalCount > 0 && filtered.length > 0;
}
