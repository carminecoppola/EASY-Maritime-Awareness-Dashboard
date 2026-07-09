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
    emptyState.textContent = visibleEvents.length ? "Nessun evento corrisponde ai filtri attivi." : "Nessun evento registrato in questa sessione.";
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
        <span class="log-row-event">${escapeHtml(group.text || friendlyEventType(group.events[0].type) || "Evento")}</span>
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
                <span class="log-row-event">${escapeHtml(logVisibleText(event) || friendlyEventType(event.type) || "Evento")}</span>
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
  grid.innerHTML = "";
  if (!snapshots.length) {
    grid.innerHTML = `<div class="empty-state">No snapshots captured in this session.</div>`;
  }
  snapshots.forEach((item) => {
    const card = document.createElement("article");
    card.className = `snapshot-card snapshot-card-${item.feed || "generic"}`;
    const feedLabel = item.feed_label || item.feed || "--";
    const feedClass = item.feed === "thermal" ? "is-thermal" : "is-rgb";
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
        <div class="snapshot-card-head">
          <div>
            <strong title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</strong>
          </div>
        </div>
        <p class="snapshot-meta-line">${escapeHtml(formatBytes(item.size_bytes))} · Roma ${escapeHtml(formatRomeDateTime(item.created))}</p>
        <p class="snapshot-path" title="${escapeHtml(item.path || "")}">${escapeHtml(item.path || "")}</p>
        <div class="button-row snapshot-actions">
          <a class="btn btn-secondary btn-small btn-icon" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${openIcon}<span>Apri</span></a>
          <a class="btn btn-ghost btn-small btn-icon" href="${escapeHtml(item.download_url)}" download="${escapeHtml(item.filename)}">${downloadIcon}<span>Scarica</span></a>
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
  const count = summary?.count ?? snapshots.length;
  setText("snapshot-count", `${count}`);
  setText("snapshot-total-size", formatBytes(summary?.size_bytes || 0));
  const latest = summary?.latest || snapshots[0];
  setText("snapshot-latest-time", latest ? `Roma ${formatRomeDateTime(latest.created)}` : "--");
  setText("snapshots-header-count", `${count}`);
  setText("snapshots-header-latest", latest ? latest.feed_label || latest.feed || "--" : "--");
  setText("snapshots-header-size", formatBytes(summary?.size_bytes || 0));
}
