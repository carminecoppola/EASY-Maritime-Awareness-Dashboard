from __future__ import annotations

import unittest
from unittest.mock import patch

from easy_dashboard.system_probe import SystemProbe


class SystemProbeOsReleaseTests(unittest.TestCase):
    # Regression: os_release() used to return the raw /etc/os-release dump
    # (PRETTY_NAME, NAME, VERSION_ID, ..., HOME_URL, SUPPORT_URL,
    # BUG_REPORT_URL) straight into a System Diagnostics card, making it by
    # far the tallest card on the page for no useful reason — PRETTY_NAME
    # alone is the label meant for exactly this kind of display.

    def test_os_release_extracts_pretty_name(self) -> None:
        raw = (
            'PRETTY_NAME="Debian GNU/Linux 11 (bullseye)"\n'
            'NAME="Debian GNU/Linux"\n'
            'VERSION_ID="11"\n'
            'VERSION="11 (bullseye)"\n'
            "VERSION_CODENAME=bullseye\n"
            "ID=debian\n"
            'HOME_URL="https://www.debian.org/"\n'
            'SUPPORT_URL="https://www.debian.org/support"\n'
            'BUG_REPORT_URL="https://bugs.debian.org/"\n'
        )
        with patch("easy_dashboard.system_probe.read_text_file", return_value=raw):
            self.assertEqual(SystemProbe().os_release(), "Debian GNU/Linux 11 (bullseye)")

    def test_os_release_falls_back_to_raw_file_without_pretty_name(self) -> None:
        raw = "ID=debian\nVERSION_ID=11\n"
        with patch("easy_dashboard.system_probe.read_text_file", return_value=raw):
            self.assertEqual(SystemProbe().os_release(), raw)

    def test_os_release_full_still_exposes_the_raw_file(self) -> None:
        raw = 'PRETTY_NAME="Debian GNU/Linux 11 (bullseye)"\nHOME_URL="https://www.debian.org/"\n'
        with patch("easy_dashboard.system_probe.read_text_file", return_value=raw):
            self.assertEqual(SystemProbe().os_release_full(), raw)


if __name__ == "__main__":
    unittest.main()
