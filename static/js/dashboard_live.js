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
    thermalImage: "live-feed-thermal-image",
    missionBar: "live-mission-command-bar",
    missionIndicator: "live-mission-state-indicator",
    missionTitle: "live-mission-state-title",
    missionCopy: "live-mission-state-copy",
    captureTitle: "live-capture-feedback-title",
    captureLink: "live-capture-feedback-link",
  };
  return mapping[action];
}

function humanMissionState(health, thermal, rgb, operations) {
  const sensors = operations.sensor_health || {};
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const rgbState = String(rgb.camera_state || "").toUpperCase();
  const readySensors = Number(sensors.online_count ?? 0);

  if (health?.ok && readySensors >= 3 && !["ERROR", "FAILED", "OFFLINE"].includes(thermalState)) {
    return {
      title: "Missione pronta",
      copy: "Le sorgenti principali sono disponibili e la dashboard può operare in modo regolare.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_DETECTED"].includes(thermalState)) {
    return {
      title: "Thermal da verificare",
      copy: "Le camere RGB possono essere operative, ma la conferma termica non è ancora affidabile.",
    };
  }
  if (["ERROR", "FAILED", "OFFLINE", "NOT_DETECTED"].includes(rgbState) || readySensors < 2) {
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
      device: rgbLeft.hardware_name || "Arducam UC-517 LEFT",
      detected: Boolean(rgbLeft.last_acquisition_ts || rgb.last_frame_ts || rgbLeft.last_frame_ts),
    },
    {
      key: "thermal",
      state: thermal.status || thermalCam.state || thermal.mode || "LOADING",
      fps: thermal.fps ?? thermal.frame_rate ?? thermalCam.fps ?? null,
      last: thermal.last_frame_ts || thermal.last_acquisition_ts || thermalCam.last_frame_ts || null,
      device: "FLIR Lepton",
      detected: Boolean(thermal.last_frame_ts || thermal.last_acquisition_ts || thermalCam.last_frame_ts),
    },
    {
      key: "rgb_right",
      state: rgbRight.state || rgb.camera_state || "LOADING",
      fps: rgbRight.fps ?? rgb.fps ?? null,
      last: rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts || null,
      device: rgbRight.hardware_name || "Arducam UC-517 RIGHT",
      detected: Boolean(rgbRight.last_acquisition_ts || rgb.last_frame_ts || rgbRight.last_frame_ts),
    },
  ].forEach((cardInfo) => {
    const tone = liveFeedTone(cardInfo.state, cardInfo.key, cardInfo.last, cardInfo.detected);
    if (cardInfo.key === "thermal" && !isFreshTimestamp(cardInfo.last)) {
      tone.offline = true;
      tone.loading = false;
      tone.dot = cardInfo.detected ? "state-dot-error" : "state-dot-muted";
      tone.badge = cardInfo.detected ? "error" : "muted";
    }
    const label = tone.offline ? (cardInfo.detected ? "Non disponibile" : "Non rilevata") : humanStateLabel(cardInfo.state);
    const statusText = liveStatusText(cardInfo.key, cardInfo.state, cardInfo.fps, cardInfo.last, cardInfo.detected);
    const card = document.querySelector(`[data-feed="${cardInfo.key}"]`);
    const badgeTone = tone.badge === "loading" ? "loading" : tone.badge;
    setBadge(liveFeedElementId(cardInfo.key, "badge"), label, badgeTone);
    setText(liveFeedElementId(cardInfo.key, "statusLine"), statusText);
    setText(liveFeedElementId(cardInfo.key, "fps"), cardInfo.fps != null && Number.isFinite(Number(cardInfo.fps)) ? `${Number(cardInfo.fps).toFixed(1)} fps` : "--");
    setText(liveFeedElementId(cardInfo.key, "lastFrame"), cardInfo.last ? formatRomeTimeOnly(cardInfo.last) : "--");
    const offlineNode = byId(liveFeedElementId(cardInfo.key, "offlineState"));
    if (card) {
      card.classList.toggle("is-offline", Boolean(tone.offline));
      card.classList.toggle("is-loading", Boolean(tone.loading));
      card.classList.toggle("is-live", !tone.offline && !tone.loading);
    }
    if (offlineNode) offlineNode.hidden = !tone.offline;
    const deviceNode = byId(liveFeedElementId(cardInfo.key, "deviceName"));
    if (deviceNode) deviceNode.textContent = cardInfo.device;
    const image = card ? card.querySelector("[data-feed-image], #live-feed-thermal-image") : null;
    if (image) image.classList.toggle("is-hidden", Boolean(tone.offline));
  });

  const sessionStatus = dashboardState.sessionStatus || health.session || {};
  const session = sessionStatus.current || sessionStatus.session || null;
  const sessionRunning = Boolean(sessionStatus.running || session?.status === "RUNNING");
  const thermalState = String(thermal.status || thermal.mode || "").toUpperCase();
  const snapshotButton = byId(liveActionElementId("snapshot"));
  if (snapshotButton) {
    snapshotButton.dataset.primaryFeed = ["REAL", "LIVE", "READY"].includes(thermalState) ? "thermal" : "rgb_left";
  }
  const recordButton = byId(liveActionElementId("record"));
  if (recordButton) {
    recordButton.disabled = false;
    recordButton.classList.toggle("btn-danger", sessionRunning);
    recordButton.classList.toggle("btn-primary", !sessionRunning);
    recordButton.textContent = sessionRunning ? "Termina missione" : "Avvia missione";
    recordButton.title = sessionRunning ? "Termina e archivia la missione corrente" : "Inizia a salvare rilevazioni, eventi e metriche";
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
}
