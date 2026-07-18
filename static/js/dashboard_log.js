function logElementId(part) {
  const mapping = {
    list: "log-list",
    emptyState: "log-empty-state",
    loadMoreButton: "button-log-load-more",
    searchInput: "log-search-input",
    sourceSelect: "log-source-filter",
    exportButton: "button-log-export-csv",
    countAll: "log-count-all",
    countError: "log-count-error",
    countInfo: "log-count-info",
    countWarning: "log-count-warning",
    countDetection: "log-count-detection",
  };
  return mapping[part];
}

function renderEventLog(events) {
  const list = byId(logElementId("list"));
  if (!list) return;
  const emptyState = byId(logElementId("emptyState"));
  const loadMoreButton = byId(logElementId("loadMoreButton"));
  const visibleEvents = (Array.isArray(events) ? events : []).slice(0, dashboardState.logLimit);
  const filtered = getVisibleLogEvents(events);
  const grouped = groupConsecutiveLogEvents(filtered);

  list.innerHTML = "";
  if (emptyState) {
    emptyState.hidden = filtered.length > 0;
    emptyState.textContent = visibleEvents.length ? "No events match the active filters." : "No events recorded in this session.";
  }

  let lastDayKey = "";
  grouped.forEach((group) => {
    const dayKey = logDayKey(group.firstTimestamp);
    if (dayKey && dayKey !== lastDayKey) {
      const divider = document.createElement("div");
      divider.className = "log-day-divider";
      divider.textContent = formatLogDayLabel(group.firstTimestamp);
      list.appendChild(divider);
      lastDayKey = dayKey;
    }
    const expanded = dashboardState.logExpandedIds?.has(group.id);
    const row = document.createElement("div");
    row.className = `log-entry${expanded ? " is-expanded" : ""}`;
    row.innerHTML = `
      <button class="log-row" type="button" data-log-row="${escapeHtml(group.id)}" aria-expanded="${expanded ? "true" : "false"}">
        <span class="log-row-time">${escapeHtml(formatLogTimestamp(group.firstTimestamp))}</span>
        <span class="log-row-source ${logSourceClass(group.events[0])}">${escapeHtml(group.sourceLabel)}</span>
        <span class="log-row-event">${escapeHtml(group.text || friendlyEventType(group.events[0].type) || "Event")}</span>
        ${group.count > 1 ? `<span class="badge badge-warning log-row-count">×${group.count}</span>` : ""}
        <span class="badge badge-${group.level.tone} log-row-level">${escapeHtml(group.level.label)}</span>
      </button>
      <div class="log-row-detail" data-log-detail="${escapeHtml(group.id)}" ${expanded ? "" : "hidden"}>
        <div class="log-group-children">
          ${group.events.map((event) => {
            const level = logLevelMeta(event);
            return `
              <div class="log-row log-row-child" role="presentation">
                <span class="log-row-time">${escapeHtml(formatLogTimestamp(event.timestamp))}</span>
                <span class="log-row-source ${logSourceClass(event)}">${escapeHtml(logSourceLabel(event))}</span>
                <span class="log-row-event">${escapeHtml(logVisibleText(event) || friendlyEventType(event.type) || "Event")}</span>
                <span class="badge badge-${level.tone} log-row-level">${escapeHtml(level.label)}</span>
              </div>
              <p class="log-row-detail-text">${escapeHtml(logExpandedText(event))}</p>
            `;
          }).join("")}
        </div>
      </div>
    `;
    row.querySelector("[data-log-row]")?.addEventListener("click", () => {
      if (!dashboardState.logExpandedIds) dashboardState.logExpandedIds = new Set();
      if (dashboardState.logExpandedIds.has(group.id)) dashboardState.logExpandedIds.delete(group.id);
      else dashboardState.logExpandedIds.add(group.id);
      renderEventLog(events);
    });
    list.appendChild(row);
  });

  if (loadMoreButton) {
    const reachedEnd = visibleEvents.length >= (Array.isArray(events) ? events.length : 0);
    loadMoreButton.hidden = reachedEnd;
    loadMoreButton.disabled = reachedEnd;
  }

  const summary = (dashboardState.eventSummary || {}).severity || {};
  const countAll = dashboardState.eventCount ?? events.length;
  const countError = summary.error ?? events.filter((event) => String(event.severity || "").toLowerCase() === "error").length;
  const countInfo = summary.info ?? events.filter((event) => String(event.severity || "").toLowerCase() === "info").length;
  const countWarning = summary.warning ?? events.filter((event) => String(event.severity || "").toLowerCase() === "warning").length;
  const countDetection = events.filter((event) => eventCategory(event) === "detection").length;

  setText(logElementId("countAll"), `${countAll}`);
  setText(logElementId("countError"), `${countError}`);
  setText(logElementId("countInfo"), `${countInfo}`);
  setText(logElementId("countWarning"), `${countWarning}`);
  setText(logElementId("countDetection"), `${countDetection}`);
}

function getVisibleLogEvents(events) {
  const visibleEvents = (Array.isArray(events) ? events : []).slice(0, dashboardState.logLimit);
  const filters = dashboardState.filters || {};
  const query = String(filters.logQuery || "").trim().toLowerCase();
  const selectedSeverity = String(filters.logSeverity || "all").toLowerCase();
  const selectedSource = String(filters.logSource || "all").toLowerCase();
  return visibleEvents.filter((event) => {
    const severity = String(event.severity || "info").toLowerCase();
    const category = eventCategory(event);
    const sourceKey = logSourceKey(event);
    const haystack = [
      event.timestamp,
      event.source,
      event.type,
      event.description,
      event.action,
      event.meta?.detail,
      event.meta?.message,
      event.meta?.raw_error,
      event.error,
    ].map((value) => String(value || "")).join(" ").toLowerCase();
    const matchesSeverity = selectedSeverity === "all" || (selectedSeverity === "detection" ? category === "detection" : severity === selectedSeverity);
    const matchesSource = selectedSource === "all" || sourceKey === selectedSource;
    const matchesQuery = !query || haystack.includes(query);
    return matchesSeverity && matchesSource && matchesQuery;
  });
}

function renderSnapshots(snapshots, summary) {
  const grid = byId("snapshot-grid");
  if (!grid) return;
  const selectedFeed = dashboardState.filters.snapshotFeed || "all";
  const visibleSnapshots = selectedFeed === "all"
    ? snapshots
    : snapshots.filter((item) => item.feed === selectedFeed);
  const renderedSnapshots = visibleSnapshots.slice(0, dashboardState.snapshotLimit || 24);
  setText("snapshot-filter-count-all", `${snapshots.length}`);
  setText("snapshot-filter-count-thermal", `${snapshots.filter((item) => item.feed === "thermal").length}`);
  setText("snapshot-filter-count-rgb-left", `${snapshots.filter((item) => item.feed === "rgb_left").length}`);
  setText("snapshot-filter-count-rgb-right", `${snapshots.filter((item) => item.feed === "rgb_right").length}`);
  grid.innerHTML = "";
  if (!visibleSnapshots.length) {
    grid.innerHTML = `<div class="empty-state">No photos are available for this camera.</div>`;
  }
  renderedSnapshots.forEach((item) => {
    const card = document.createElement("article");
    card.className = `snapshot-card snapshot-card-${item.feed || "generic"}`;
    const feedLabel = item.feed_label || item.feed || "--";
    const feedClass = item.feed === "thermal" ? "is-thermal" : "is-rgb";
    const thermalReadingLabel = item.feed === "thermal"
      ? item.meta?.anomaly_active === true
        ? "Anomaly detected in the reading"
        : item.meta?.anomaly_active === false
          ? "Reading within range at capture time"
          : "Thermal reading status unavailable"
      : "";
    const thermalReadingTone = item.meta?.anomaly_active === true ? "is-alert" : item.meta?.anomaly_active === false ? "is-normal" : "is-unknown";
    const openIcon = `<svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7"></path><path d="M13 3 6 10"></path><path d="M4 5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1"></path></svg>`;
    const downloadIcon = `<svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7"></path><path d="m5.2 7.8 2.8 2.8 2.8-2.8"></path><path d="M3 13.5h10"></path></svg>`;
    card.innerHTML = `
      <div class="snapshot-media">
        <a class="snapshot-image-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
          <img class="snapshot-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(feedLabel)} snapshot" loading="lazy">
        </a>
        <div class="snapshot-overlay">
          <span class="snapshot-feed ${feedClass}">${escapeHtml(feedLabel)}</span>
          <span class="snapshot-age">${escapeHtml(formatRomeDateTime(item.created))}</span>
        </div>
        <div class="snapshot-fallback" hidden>
          <strong>Preview not available</strong>
          <p>The file exists, but the browser could not display the thumbnail.</p>
        </div>
      </div>
      <div class="snapshot-card-body">
        ${thermalReadingLabel ? `<span class="snapshot-thermal-context ${thermalReadingTone}" title="${escapeHtml(thermalReadingLabel)}">${escapeHtml(thermalReadingLabel)}</span>` : ""}
        <div class="snapshot-card-head">
          <div>
            <strong title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</strong>
          </div>
        </div>
        <p class="snapshot-meta-line">${escapeHtml(formatBytes(item.size_bytes))} · Rome ${escapeHtml(formatRomeDateTime(item.created))}</p>
        <p class="snapshot-path">Archive ${escapeHtml(feedLabel)} · ${escapeHtml(formatAgeIt(item.created_ts))}</p>
        <div class="button-row snapshot-actions">
          <a class="btn btn-secondary btn-small btn-icon" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${openIcon}<span>Open</span></a>
          <a class="btn btn-ghost btn-small btn-icon" href="${escapeHtml(item.download_url)}" download="${escapeHtml(item.filename)}">${downloadIcon}<span>Download</span></a>
        </div>
      </div>
    `;
    const img = card.querySelector(".snapshot-image");
    const fallback = card.querySelector(".snapshot-fallback");
    if (img && fallback) {
      img.addEventListener("error", () => {
        img.hidden = true;
        fallback.hidden = false;
      });
      img.addEventListener("load", () => {
        img.hidden = false;
        fallback.hidden = true;
      });
    }
    grid.appendChild(card);
  });
  setText("snapshot-visible-count", `${renderedSnapshots.length} of ${visibleSnapshots.length} photos shown`);
  const loadMoreButton = byId("button-snapshot-load-more");
  const pagination = byId("snapshot-pagination");
  if (loadMoreButton) {
    const hasMore = renderedSnapshots.length < visibleSnapshots.length;
    loadMoreButton.hidden = !hasMore;
    loadMoreButton.disabled = !hasMore;
  }
  if (pagination) pagination.hidden = visibleSnapshots.length === 0;
  const count = summary?.count ?? snapshots.length;
  setText("snapshot-count", `${count}`);
  setText("snapshot-total-size", formatBytes(summary?.size_bytes || 0));
  const latest = summary?.latest || snapshots[0];
  setText("snapshot-latest-time", latest ? `Rome ${formatRomeDateTime(latest.created)}` : "--");
  setText("snapshots-header-count", `${count}`);
  setText("snapshots-header-latest", latest ? latest.feed_label || latest.feed || "--" : "--");
  setText("snapshots-header-size", formatBytes(summary?.size_bytes || 0));
}

function setupLogPage() {
  const initialArchiveTab = new URLSearchParams(window.location.search).get("view") === "log" ? "events" : "photos";
  const selectArchiveTab = (tab) => {
    document.querySelectorAll("[data-archive-tab]").forEach((button) => {
      const active = button.dataset.archiveTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-archive-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.archivePanel !== tab;
    });
    setText("archive-current-section", tab === "events" ? "Activity log" : "Saved photos");
  };
  document.querySelectorAll("[data-archive-tab]").forEach((button) => {
    button.addEventListener("click", () => selectArchiveTab(button.dataset.archiveTab));
  });
  document.querySelectorAll("[data-snapshot-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardState.filters.snapshotFeed = button.dataset.snapshotFeed || "all";
      dashboardState.snapshotLimit = 24;
      document.querySelectorAll("[data-snapshot-feed]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderSnapshots(dashboardState.snapshots, dashboardState.snapshotSummary);
    });
  });
  const snapshotLoadMore = byId("button-snapshot-load-more");
  if (snapshotLoadMore) {
    snapshotLoadMore.addEventListener("click", () => {
      dashboardState.snapshotLimit += 24;
      renderSnapshots(dashboardState.snapshots, dashboardState.snapshotSummary);
    });
  }
  selectArchiveTab(initialArchiveTab);

  DashboardApi.request("/api/snapshots/recent?limit=200").then((response) => {
    if (!response.ok || !response.data) return;
    dashboardState.snapshots = response.data.items || [];
    dashboardState.snapshotSummary = response.data.summary || dashboardState.snapshotSummary;
    renderSnapshots(dashboardState.snapshots, dashboardState.snapshotSummary);
  }).catch((error) => console.error("Archive photos unavailable", error));

  const logExportButton = byId(logElementId("exportButton"));
  if (logExportButton) {
    logExportButton.addEventListener("click", () => {
      const visibleEvents = getVisibleLogEvents(dashboardState.events);
      const csvRows = [
        ["timestamp", "source", "event", "severity", "detail"],
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
