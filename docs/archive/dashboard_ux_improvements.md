# EASY Dashboard UX Improvements

## UX problems found

- The Mission Console felt too box-heavy and the hierarchy did not immediately answer what is online, what needs attention, and what to do next.
- The layout did not use enough horizontal space, so live feeds felt smaller than the available display area.
- Placeholder-heavy panels and generic empty states reduced readability for first-time viewers.
- Developer diagnostics were mixed too close to the primary operational view.
- Snapshot thumbnails could expose broken browser image UI when previews were missing.
- Some labels were too technical for operators who only needed a quick operational read.

## What changed

- Added a Simple View / Advanced View toggle persisted in localStorage.
  - Simple View hides technical side panels and extra diagnostics.
  - Advanced View restores FPS, errors, service state, and deeper health detail.
- Rebased the dashboard on a wider shell and denser grids so live feeds use more of the available screen.
- Rebuilt the Mission Console around a concise operational flow:
  - human system status
  - primary actions
  - compact status metrics
  - dominant live feeds
  - bottom operational summary bar
- Added clearer empty states and user-facing copy for detections, events, fusion preview, and missing frames.
- Kept Thermal & Events readable by emphasizing the heatmap, min / avg / max, alarm state, and a lighter log presentation.
- Reworked the snapshot archive so failed previews render an elegant placeholder tile instead of a broken browser icon.
- Standardized tone and naming around the operational labels `RGB LEFT`, `RGB RIGHT`, `THERMAL`, and `FUSED VIEW`.

## What remains to improve

- Replace the remaining synthetic placeholder data with real detection, fusion, inference, and recording pipelines when they become available.
- Add a compact history visualization if the thermal backend starts exposing time-series samples consistently.
- If the snapshot archive grows, add paging or date filtering to keep the gallery dense but manageable.
- A future pass could add stronger keyboard navigation and accessibility refinements for the view toggle and action bars.
- If needed later, the diagnostics page can be split into smaller subsections or tabs once it accumulates more technical detail.
# Final operator UI pass

The final interface establishes one visual priority per page instead of giving
every panel the same weight. Navigation is compact and sticky, page titles are
separate from the product identity, and the Live page now presents mission
controls before video, summaries, dataset tools, source configuration and the
optional guide.

The operator guide is collapsed by default, focus states are visible, reduced
motion preferences are respected, and the mobile layout keeps the four primary
sections reachable without a menu. Existing DOM ids and API contracts were
preserved so the visual redesign does not change the validated runtime flow.

Browser validation covered desktop and 390x844 mobile layouts, start/stop
mission feedback, inference error feedback, and rendering of Live,
Rilevazioni, Foto e log, Sistema and Guida.

The follow-up simplification keeps Rilevazioni focused on the AI action,
analysis state and latest result. First-use guidance, mission metrics, replay
controls, event history and raw detections remain available in collapsed
sections. Sistema now leads with temperature/resources and actionable errors;
component and device inventories are grouped under one technical disclosure.
Desktop and 390x844 mobile browser checks confirmed that the hidden sections
open correctly and retain their runtime DOM targets.
