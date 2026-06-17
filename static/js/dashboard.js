function byId(id) {
  return document.getElementById(id);
}

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

function streamControl(feed, action) {
  return fetch(`/video/${feed}/${action}`, { method: "POST" }).then((res) => res.json());
}

function snapshot(feed) {
  window.location.href = `/snapshot/${feed}`;
}

function reloadThermalFrame() {
  const node = byId("thermal-frame");
  if (node) {
    node.src = `/thermal/frame?ts=${Date.now()}`;
  }
}

function updateEventLog(events) {
  const body = byId("event-body");
  if (!body) return;
  body.innerHTML = "";
  events.forEach((event) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${event.timestamp || "--"}</td>
      <td>${event.source || "--"}</td>
      <td>${event.type || "--"}</td>
      <td>${event.description || "--"}</td>
      <td class="event-severity-${String(event.severity || "info").toLowerCase()}">${event.severity || "info"}</td>
    `;
    body.appendChild(row);
  });
}

async function refreshDashboard() {
  try {
    const [healthRes, eventsRes] = await Promise.all([
      fetch("/health", { cache: "no-store" }),
      fetch("/events?limit=20", { cache: "no-store" }),
    ]);
    const health = await healthRes.json();
    const eventsPayload = await eventsRes.json();

    const system = health.system || {};
    const cameras = health.cameras || {};
    const rgb = health.rgb || {};
    const thermal = health.thermal || {};
    const rgbCams = cameras.rgb_cameras || [];
    const rgbLeft = rgbCams[0] || {};
    const rgbRight = rgbCams[1] || {};
    const uc512 = cameras.uc512_multiplexer || {};
    const thermalCam = cameras.thermal_camera || {};

    setText("timestamp", health.timestamp || "--");
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
    setText("rgb_left_last", formatAge(rgbLeft.last_acquisition_ts || rgb.last_frame_ts));
    setText("rgb_right_last", formatAge(rgbRight.last_acquisition_ts || rgb.last_frame_ts));
    setText("rgb_left_error", rgbLeft.error || rgb.error || "--");
    setText("rgb_right_error", rgbRight.error || rgb.error || "--");
    setText("thermal_min", thermal.min_c != null ? `${thermal.min_c} C` : "--");
    setText("thermal_avg", thermal.avg_c != null ? `${thermal.avg_c} C` : "--");
    setText("thermal_max", thermal.max_c != null ? `${thermal.max_c} C` : "--");
    setText("thermal_anomaly", thermal.anomaly_active ? "YES" : "NO");
    setText("overlay-rgb_left", rgbLeft.message || rgb.message || "Latest feed available");
    setText("overlay-rgb_right", rgbRight.message || rgb.message || "Latest feed available");
    setText("overlay-thermal", thermal.message || "Thermal stream active");

    const deviceList = byId("device-list");
    if (deviceList) {
      deviceList.innerHTML = [
        `<div class="device-row"><strong>${uc512.logical_name || "UC512_MULTIPLEXER"}</strong><div>${uc512.hardware_name || ""}</div><div>Status: ${uc512.state || "--"}${uc512.message ? ` | ${uc512.message}` : ""}</div></div>`,
        ...rgbCams.map((cam) => `<div class="device-row"><strong>${cam.logical_name}</strong><div>${cam.hardware_name}</div><div>Status: ${cam.state || "--"} | FPS: ${cam.fps ?? "--"}${cam.message ? ` | ${cam.message}` : ""}</div></div>`),
        `<div class="device-row"><strong>${thermalCam.logical_name || "THERMAL_FLIR"}</strong><div>${thermalCam.hardware_name || ""}</div><div>Status: ${thermalCam.state || "--"} | Mode: ${thermalCam.mode || "--"}</div></div>`,
      ].join("");
    }

    updateEventLog((eventsPayload && eventsPayload.events) || []);
  } catch (error) {
    setText("system-state", "ERROR");
    setText("timestamp", "--");
  } finally {
    reloadThermalFrame();
  }
}

window.addEventListener("load", () => {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const feed = button.getAttribute("data-feed");
      const action = button.getAttribute("data-action");
      try {
        await streamControl(feed, action);
        await refreshDashboard();
      } catch (error) {
        console.error(error);
      }
    });
  });

  document.querySelectorAll("[data-snapshot]").forEach((button) => {
    button.addEventListener("click", () => {
      const feed = button.getAttribute("data-snapshot");
      snapshot(feed);
    });
  });

  const thermalButton = byId("thermal-snapshot");
  if (thermalButton) {
    thermalButton.addEventListener("click", () => {
      window.location.href = "/thermal/snapshot";
    });
  }

  const rgbImages = document.querySelectorAll("[data-feed-image]");
  rgbImages.forEach((img) => {
    img.addEventListener("error", () => {
      const feed = img.getAttribute("data-feed-image");
      const overlay = byId(`overlay-${feed}`);
      if (overlay) overlay.textContent = "Feed unavailable";
    });
  });

  refreshDashboard();
  window.setInterval(refreshDashboard, 2500);
});
