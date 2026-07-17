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
    datasetSessionId: "dataset-session-id",
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
      title: "Missione pronta",
      copy: "Le sorgenti principali sono disponibili e la dashboard può operare in modo regolare.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_PRESENT", "NOT_DETECTED"].includes(thermalState)) {
    return {
      title: "Thermal da verificare",
      copy: "Le camere RGB possono essere operative, ma la conferma termica non è ancora affidabile.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_PRESENT", "NOT_DETECTED"].includes(rgbState) || readySensors < 2) {
    return {
      title: "Live ancora incompleto",
      copy: "Almeno una sorgente visibile non sta consegnando frame stabili. Conviene recuperarla prima di procedere.",
    };
  }
  return {
    title: "Serve un controllo rapido",
    copy: "Il sistema è quasi pronto, ma conviene verificare gli stream principali prima di aprire una nuova sessione.",
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
  setText(liveSummaryElementId("healthCopy"), mission.copy || "Controlla lo stato delle sorgenti live.");
  setText(liveSummaryElementId("sourceTitle"), selectedSource.label || selectedSource.id || "Non selezionata");
  setText(liveSummaryElementId("sourceCopy"), selectedSource.description || selectedSource.state || "Seleziona la sorgente attiva del Frame Provider dal pannello qui sotto.");
  setText(liveSummaryElementId("sessionTitle"), healthSession.running ? "In corso" : "Standby");
  setText(
    liveSummaryElementId("sessionCopy"),
    healthSession.running
      ? `Sessione ${healthSession.session_id || "--"} · ${formatUptimeShort(healthSession.duration_seconds || 0)}`
      : "Avvia una sessione quando vuoi archiviare detections ed eventi della missione.",
  );
  setText(liveSummaryElementId("detectionsCount"), `${detectionCount}`);
  setText(
    liveSummaryElementId("detectionsCopy"),
    detectionCount > 0
      ? `L'ultimo ciclo AI ha prodotto ${detectionCount} detection${detectionCount === 1 ? "" : "s"}.`
      : "Nessuna detection corrente: il replay è pronto ma non ha ancora generato risultati utili.",
  );

  [
    {
      key: "rgb_left",
      state: rgbLeft.state || rgb.camera_state || "LOADING",
      fps: rgbLeft.fps ?? rgb.fps ?? null,
      last: rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgbLeft.last_frame_ts || null,
      device: "Nessun segnale dalla camera sinistra",
      technicalDetail: rgbLeft.error || rgb.error || rgbLeft.hardware_name || "Arducam UC-517 LEFT",
      detected: Boolean(rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgbLeft.last_frame_ts),
    },
    {
      key: "thermal",
      state: thermalVisual.state,
      fps: thermal.fps ?? thermal.frame_rate ?? thermalCam.fps ?? null,
      last: thermalVisual.lastFrame,
      device: thermal.detected ? "Nessun segnale dalla camera termica" : "Sensore termico non rilevato",
      technicalDetail: thermal.error || (thermal.detected ? `${thermal.device || "FLIR"} rilevato, ma senza frame` : "PureThermal video node not found. Check USB cable and v4l2-ctl --list-devices."),
      detected: thermalVisual.detected,
    },
    {
      key: "rgb_right",
      state: rgbRight.state || rgb.camera_state || "LOADING",
      fps: rgbRight.fps ?? rgb.fps ?? null,
      last: rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts || null,
      device: "Nessun segnale dalla camera destra",
      technicalDetail: rgbRight.error || rgb.error || rgbRight.hardware_name || "Arducam UC-517 RIGHT",
      detected: Boolean(rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts),
    },
  ].forEach((cardInfo) => {
    const hasFreshFrame = isFreshTimestamp(cardInfo.last);
    const tone = liveFeedTone(cardInfo.state, cardInfo.key, cardInfo.last, cardInfo.detected);
    const effectiveTone = cardInfo.key === "thermal" ? thermalVisual.tone : tone;
    const label = cardInfo.key === "thermal" ? thermalVisual.label : effectiveTone.offline ? "Nessun segnale" : humanStateLabel(cardInfo.state);
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
        deviceNode.setAttribute("aria-label", `${cardInfo.device}. Dettaglio tecnico: ${cardInfo.technicalDetail}`);
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
    if (label) label.textContent = thermalVisual.hasCachedFrame ? "Aggiorna lettura" : "Leggi termica";
  }

  const sessionStatus = dashboardState.sessionStatus || health.session || {};
  const session = sessionStatus.current || sessionStatus.session || null;
  const sessionRunning = Boolean(sessionStatus.running || session?.status === "RUNNING");
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const snapshotButton = byId(liveActionElementId("snapshot"));
  if (snapshotButton) {
    snapshotButton.dataset.primaryFeed = ["REAL", "LIVE", "READY"].includes(thermalState) ? "thermal" : "rgb_left";
    snapshotButton.disabled = !sessionRunning;
    snapshotButton.textContent = "Salva set sensori";
    snapshotButton.title = sessionRunning
      ? "Salva nello stesso campione RGB sinistra, RGB destra e termico"
      : "Disponibile dopo l’avvio della missione";
  }
  const recordButton = byId(liveActionElementId("record"));
  if (recordButton) {
    recordButton.disabled = false;
    recordButton.classList.toggle("btn-danger", sessionRunning);
    recordButton.classList.toggle("btn-primary", !sessionRunning);
    recordButton.textContent = sessionRunning ? "Termina missione" : "Avvia missione";
    recordButton.title = sessionRunning ? "Termina e archivia la missione corrente" : "Inizia a salvare rilevazioni, eventi e metriche";
  }

  const captureFeedbackTitle = byId(liveActionElementId("captureTitle"));
  if (captureFeedbackTitle && !captureFeedbackTitle.dataset.actionFeedback) {
    captureFeedbackTitle.textContent = sessionRunning
      ? "Registrazione attiva · ora puoi salvare un set sensori"
      : sessionStatus.latest
        ? "Missione terminata · puoi controllare lo storico"
        : "In attesa dell’avvio";
  }

  const missionBar = byId(liveActionElementId("missionBar"));
  const missionIndicator = byId(liveActionElementId("missionIndicator"));
  if (missionBar) missionBar.classList.toggle("is-running", sessionRunning);
  if (missionIndicator) missionIndicator.classList.toggle("is-running", sessionRunning);
  setText(liveActionElementId("missionTitle"), sessionRunning ? "Missione in registrazione" : "Nessuna missione attiva");
  setText(
    liveActionElementId("missionCopy"),
    sessionRunning
      ? `${session?.session_id || "Sessione EASY"} · ${formatUptimeShort(session?.metrics?.session_duration ?? session?.duration ?? 0)} · dati salvati sulla Raspberry`
      : "Avvia una missione per salvare rilevazioni, eventi e metriche sulla Raspberry.",
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

  setBadge(liveActionElementId("datasetStateBadge"), running ? "Missione attiva" : sessionId ? "Ultima missione" : "Standby", running ? "online" : sessionId ? "warning" : "muted");
  setText(
    liveActionElementId("datasetExplanation"),
    running
      ? "Ogni acquisizione viene aggiunta al manifest della sessione in corso."
      : sessionId
        ? "Questi sono gli ultimi dati archiviati. Avvia una nuova missione per continuare la raccolta."
        : "Avvia una missione per creare un manifest con foto, inferenze e coppie RGB/termiche.",
  );
  setText(liveActionElementId("datasetSessionId"), sessionId || "Nessuna sessione");
  setText(
    liveActionElementId("datasetManifestPath"),
    manifestPath ? `Manifest: ${compactPath(manifestPath)}` : "Il manifest apparirà qui appena la missione salva il primo dato.",
  );
  setText(liveActionElementId("datasetSamplesCount"), `${datasetSummary.samples ?? manifestCounts.samples ?? 0}`);
  setText(liveActionElementId("datasetPairedCount"), `${datasetSummary.synchronized_samples ?? manifestCounts.synchronized_samples ?? datasetSummary.paired_items ?? manifestCounts.paired_items ?? 0}`);
  setText(liveActionElementId("datasetSnapshotsCount"), `${manifestCounts.snapshots ?? 0}`);
  setText(liveActionElementId("datasetInferenceCount"), `${manifestCounts.inference ?? 0}`);
  setText(liveActionElementId("datasetDetectionsCount"), `${manifestCounts.detections ?? 0}`);

  const feedLabels = {
    rgb_left: "RGB sinistra",
    rgb_right: "RGB destra",
    thermal: "Termico",
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
  setText("mission-history-count", `${items.length} mission${items.length === 1 ? "e" : "i"}`);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Nessuna missione archiviata.</div>';
    return;
  }
  list.innerHTML = items.map((session, index) => {
    const sessionId = String(session.session_id || "");
    const running = String(session.status || "").toUpperCase() === "RUNNING";
    return `<button class="mission-history-row${index === 0 ? " is-active" : ""}" type="button" data-mission-history-id="${escapeHtml(sessionId)}" aria-pressed="${index === 0 ? "true" : "false"}"><span><strong>${escapeHtml(formatRomeDateTime(session.start_time))}</strong><small>${escapeHtml(sessionId || "Sessione EASY")}</small></span><span><span class="badge badge-${running ? "online" : "muted"}">${running ? "In corso" : "Archiviata"}</span><small>${escapeHtml(formatSessionDuration(session.duration))}</small></span></button>`;
  }).join("");
}

function renderMissionHistoryDetail(session, manifest) {
  const detail = byId("mission-history-detail");
  if (!detail) return;
  const counts = manifest?.counts || {};
  const byFeed = counts.by_feed || {};
  const sessionId = String(session?.session_id || manifest?.session_id || "");
  detail.innerHTML = `<div class="mission-history-detail-head"><span class="mission-data-label">Missione selezionata</span><strong>${escapeHtml(formatRomeDateTime(session?.start_time))}</strong><p>${escapeHtml(sessionId || "Sessione EASY")} · ${escapeHtml(formatSessionDuration(session?.duration))}</p></div><dl class="mission-history-counts"><div><dt>Campioni</dt><dd>${escapeHtml(String(counts.samples || 0))}</dd></div><div><dt>Foto</dt><dd>${escapeHtml(String(counts.snapshots || 0))}</dd></div><div><dt>Inferenze</dt><dd>${escapeHtml(String(counts.inference || 0))}</dd></div><div><dt>Rilevazioni</dt><dd>${escapeHtml(String(counts.detections || 0))}</dd></div></dl><div class="mission-history-feeds"><span>RGB sinistra <strong>${escapeHtml(String(byFeed.rgb_left || 0))}</strong></span><span>RGB destra <strong>${escapeHtml(String(byFeed.rgb_right || 0))}</strong></span><span>Termico <strong>${escapeHtml(String(byFeed.thermal || 0))}</strong></span></div><p class="mission-history-feedback" id="mission-history-feedback">${manifest?.ok === false ? "Manifest non disponibile per questa missione." : "Manifest caricato: puoi validare il dataset o esportarlo."}</p><div class="mission-history-actions"><button class="btn btn-ghost btn-small" type="button" data-history-validate="${escapeHtml(sessionId)}">Valida dataset</button><button class="btn btn-secondary btn-small" type="button" data-history-export="${escapeHtml(sessionId)}">Esporta ZIP</button><a class="panel-link" href="/snapshots">Vedi foto</a></div>`;
}
