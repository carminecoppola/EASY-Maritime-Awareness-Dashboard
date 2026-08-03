function systemElementId(part) {
  const mapping = {
    cpu: "system-resource-cpu",
    ram: "system-resource-ram",
    disk: "system-resource-disk",
    cpuTemp: "system-resource-cpu-temp",
    uptime: "system-resource-uptime",
    orchestratorBadge: "system-orchestrator-status-badge",
    orchestratorActiveCount: "system-orchestrator-active-count",
    orchestratorTotalCount: "system-orchestrator-total-count",
    orchestratorUptime: "system-orchestrator-uptime",
    orchestratorErrorCount: "system-orchestrator-error-count",
    orchestratorComponentList: "system-orchestrator-component-list",
    deviceCount: "system-device-summary-count",
    deviceList: "system-device-list",
    errorsEmpty: "system-errors-empty-state",
    errorsList: "system-errors-list",
  };
  return mapping[part];
}

function renderSystemDevices(payload) {
  const node = byId(systemElementId("deviceList"));
  const countNode = byId(systemElementId("deviceCount"));
  if (!node) return;
  node.innerHTML = "";
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  const connectedCount = Number(payload?.connected_count ?? devices.filter((item) => ["CONNECTED", "STREAMING"].includes(String(item?.status || "").toUpperCase())).length);
  if (countNode) countNode.textContent = `${connectedCount}/${devices.length || 4}`;
  if (!devices.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>Loading devices</strong><p>Video sources will appear here as soon as they become available.</p></div>`;
    return;
  }
  devices.forEach((item) => {
    const tone = stateTone(item.status);
    const updated = item.last_seen ? formatRomeDateTime(item.last_seen) : "--";
    const row = document.createElement("div");
    row.className = "system-device-row";
    row.innerHTML = `
      <div class="system-device-main">
        <strong class="system-device-name">${escapeHtml(item.device_name || item.name || item.device_id || "--")}</strong>
        <span class="system-device-desc">${escapeHtml([item.device_type, item.driver, item.configuration?.side].filter(Boolean).join(" · ") || "No configuration")}</span>
      </div>
      <div class="system-device-main">
        <span class="system-device-desc">${escapeHtml(`FPS ${item.fps != null ? Number(item.fps).toFixed(1) : "--"} · ${item.temperature != null ? `${Number(item.temperature).toFixed(1)}°C` : "--"}`)}</span>
        <span class="system-device-desc">${escapeHtml(updated)}</span>
      </div>
      <span class="badge badge-${tone.badge || "muted"} system-device-state">${escapeHtml(humanStateLabel(item.status || "--"))}</span>
    `;
    node.appendChild(row);
  });
}

function renderSystemStatus(payload) {
  const status = payload || {};
  const node = byId(systemElementId("orchestratorComponentList"));
  const badge = byId(systemElementId("orchestratorBadge"));
  if (!node) return;
  node.innerHTML = "";
  const components = Array.isArray(status.components) ? status.components : [];
  const activeCount = Number(status.active_count ?? components.filter((item) => Boolean(item?.active)).length);
  const errorCount = Number(status.error_count ?? components.filter((item) => Boolean(item?.error)).length);
  const overallState = String(status.status || (status.ok ? "RUNNING" : "DEGRADED")).toUpperCase();
  const tone = stateTone(overallState);
  if (badge) {
    badge.textContent = humanStateLabel(overallState);
    badge.className = `badge badge-${tone.badge || "muted"}`;
  }
  setText(systemElementId("orchestratorActiveCount"), `${activeCount}`);
  setText(systemElementId("orchestratorTotalCount"), `${components.length || 0}`);
  setText(systemElementId("orchestratorErrorCount"), `${errorCount}`);
  setText(systemElementId("orchestratorUptime"), status.uptime || formatUptimeShort(status.uptime_seconds));
  if (!components.length) {
    node.innerHTML = `<div class="placeholder-item"><strong>Loading services</strong><p>Components will appear here after the dashboard starts.</p></div>`;
    return;
  }
  components.forEach((item) => {
    const row = document.createElement("div");
    row.className = "system-device-row system-component-row";
    const componentTone = stateTone(item.status || item.health);
    const errorText = item.error ? cleanLogText(item.error) : "No errors";
    row.innerHTML = `
      <div class="system-device-main">
        <strong class="system-device-name">${escapeHtml(item.label || item.id || "--")}</strong>
        <span class="system-device-desc">${escapeHtml([item.kind, item.id].filter(Boolean).join(" · "))}</span>
      </div>
      <div class="system-device-main">
        <span class="system-device-desc">${escapeHtml(`Status ${humanStateLabel(item.health || "--")} · Active for ${item.uptime || "--"}`)}</span>
        <span class="system-device-desc">${escapeHtml(errorText)}</span>
      </div>
      <span class="badge badge-${componentTone.badge || "muted"} system-device-state">${escapeHtml(humanStateLabel(item.status || item.health || "--"))}</span>
    `;
    node.appendChild(row);
  });
}

function renderSystemErrors(events) {
  const list = byId(systemElementId("errorsList"));
  const empty = byId(systemElementId("errorsEmpty"));
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
      <span class="log-row-time">${escapeHtml(formatRomeDateTime(event.timestamp))}</span>
      <span class="badge ${logSourceClass(event)}">${escapeHtml(logSourceLabel(event))}</span>
      <div class="system-error-main">
        <strong class="system-error-title">${escapeHtml(cleanLogText(event.description || event.message || event.type || "Error"))}</strong>
      </div>
      <span class="badge badge-error">${escapeHtml(logLevelMeta(event).label)}</span>
    `;
    list.appendChild(row);
  });
}

function renderSystemPage(health) {
  const system = health.system || {};
  const cpu = Number(system.cpu_percent ?? 0);
  const ram = Number(system.ram?.percent ?? 0);
  const disk = Number(system.disk?.percent ?? 0);
  const temp = Number(system.cpu_temperature_c ?? 0);
  const uptime = formatUptimeShort(system.uptime_seconds);
  setMetricValue(systemElementId("cpu"), `${cpu.toFixed(1)}%`, cpuTone(cpu));
  setMetricValue(systemElementId("ram"), `${ram.toFixed(1)}%`, cpuTone(ram));
  setMetricValue(systemElementId("disk"), `${disk.toFixed(1)}%`, cpuTone(disk));
  setMetricValue(systemElementId("cpuTemp"), temp ? `${temp.toFixed(1)}°C` : "--", tempTone(temp));
  setMetricValue(systemElementId("uptime"), uptime, "neutral");
  renderSystemStatus(dashboardState.systemComponents || dashboardState.systemStatus || health.system_orchestrator || health.system_components);
  renderSystemDevices(dashboardState.devices);
  renderSystemErrors(recentErrorEvents(dashboardState.events, 5));
}

function updateNavIndicators(health, eventsPayload) {
  const errorCount = eventsPayload?.summary?.severity?.error || 0;
  document.querySelectorAll("[data-nav-key]").forEach((link) => {
    const key = link.getAttribute("data-nav-key");
    const badge = link.querySelector(".nav-alert-badge");
    if (!badge) return;
    const showBadge = key === "log" && errorCount > 0;
    badge.hidden = !showBadge;
    badge.classList.remove("is-online", "is-warning", "is-error", "is-muted");
    if (showBadge) {
      badge.classList.add("is-warning");
      badge.textContent = `${errorCount} err`;
      badge.title = `${errorCount} total errors recorded in the activity history`;
      badge.setAttribute("aria-label", `${errorCount} total errors recorded in the activity history`);
    } else {
      badge.textContent = "";
      badge.removeAttribute("title");
      badge.removeAttribute("aria-label");
    }
  });
}
