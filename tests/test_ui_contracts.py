from __future__ import annotations

import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = PROJECT_ROOT / "templates"
STATIC = PROJECT_ROOT / "static"


class DashboardUiContractTests(unittest.TestCase):
    def test_design_system_is_the_last_css_layer(self) -> None:
        base = (TEMPLATES / "base.html").read_text(encoding="utf-8")
        layers = [
            "foundations.css",
            "runtime-layout.css",
            "page-layouts.css",
            "operator-overrides.css",
            "design-system.css",
        ]
        positions = [base.index(layer) for layer in layers]
        self.assertEqual(positions, sorted(positions))

    def test_critical_runtime_bindings_remain_in_their_pages(self) -> None:
        expected = {
            "index.html": {
                "live-feed-rgb-left-badge",
                "live-feed-rgb-right-badge",
                "live-feed-thermal-badge",
                "button-live-refresh",
                "button-thermal-capture",
            },
            "mission.html": {
                "button-live-toggle-recording",
                "button-live-save-snapshot",
                "button-dataset-validate",
                "button-dataset-export",
                "live-source-grid",
                "mission-history-list",
                "mission-history-detail",
            },
            "thermal_events.html": {
                "button-ai-start",
                "button-ai-stop",
                "analysis-monitor",
                "detections-ai-preview-image",
                "events-current-grid",
                "events-timeline-list",
                "detections-table-rows",
            },
            "snapshots.html": {
                "snapshot-grid",
                "button-snapshot-load-more",
                "log-list",
                "button-log-export-csv",
            },
            "system_diagnostics.html": {
                "system-resource-cpu",
                "system-resource-cpu-temp",
                "system-errors-list",
                "system-device-list",
            },
        }
        for filename, required_ids in expected.items():
            source = (TEMPLATES / filename).read_text(encoding="utf-8")
            ids = set(re.findall(r'\bid="([^"]+)"', source))
            self.assertFalse(required_ids - ids, f"{filename} lost IDs: {sorted(required_ids - ids)}")

    def test_operator_copy_does_not_reintroduce_known_italian_labels(self) -> None:
        sources = list(TEMPLATES.rglob("*.html")) + list((STATIC / "js").glob("*.js"))
        forbidden = re.compile(
            r"\b(?:avvia|termina|missione|rilevazioni|sorgente|termica|lettura|"
            r"archivio|scarica|aggiorna|nessuna|errore|disponibile|attesa)\b",
            re.IGNORECASE,
        )
        findings: list[str] = []
        for path in sources:
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if forbidden.search(line):
                    findings.append(f"{path.relative_to(PROJECT_ROOT)}:{line_number}: {line.strip()}")
        self.assertEqual(findings, [], "Italian operator copy found:\n" + "\n".join(findings))

    def test_accessibility_foundations_are_explicit(self) -> None:
        css = (STATIC / "css" / "design-system.css").read_text(encoding="utf-8")
        self.assertIn(":focus-visible", css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", css)
        self.assertIn("min-height: 44px", css)


if __name__ == "__main__":
    unittest.main()
