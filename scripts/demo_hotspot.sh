#!/usr/bin/env bash
set -euo pipefail

# Toggle the Pi's onboard Wi-Fi (wlan0) between its normal home-network
# client mode and a standalone access point for demoing EASY somewhere with
# no usable network of its own (e.g. a conference).
#
# ############################################################################
# # DANGER: this Pi has a single Wi-Fi radio and no Ethernet fallback.       #
# # Running "enable" disconnects wlan0 from whatever network reached it     #
# # over SSH, including a remote tunnel. Only run this with a monitor and   #
# # keyboard plugged directly into the Pi (or physically next to it), never #
# # over the same SSH session you are trying to keep. If "enable" leaves    #
# # the Pi unreachable, you need physical access to run "disable" or        #
# # recover it -- there is no remote fallback.                              #
# ############################################################################
#
# Usage:
#   scripts/demo_hotspot.sh status
#   scripts/demo_hotspot.sh enable --i-am-physically-at-the-pi
#   scripts/demo_hotspot.sh disable --i-am-physically-at-the-pi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DHCPCD_CONF="/etc/dhcpcd.conf"
DHCPCD_BACKUP="/etc/dhcpcd.conf.pre-demo-hotspot"
HOSTAPD_CONF_DST="/etc/hostapd/hostapd.conf"
DNSMASQ_CONF_DST="/etc/dnsmasq.conf"
DNSMASQ_BACKUP="/etc/dnsmasq.conf.pre-demo-hotspot"
AP_IP="192.168.50.1/24"

ACTION="${1:-}"
CONFIRM="${2:-}"

usage() {
  echo "Usage: $0 {status|enable|disable} [--i-am-physically-at-the-pi]" >&2
  exit 1
}

require_confirmation() {
  if [[ "${CONFIRM}" != "--i-am-physically-at-the-pi" ]]; then
    echo "Refusing to proceed without physical-presence confirmation." >&2
    echo "Re-run as: $0 ${ACTION} --i-am-physically-at-the-pi" >&2
    echo "Only pass that flag if you have a monitor/keyboard on this Pi right now," >&2
    echo "or are otherwise not depending on the network you are about to change." >&2
    exit 1
  fi
}

status() {
  echo "--- interfaces ---"
  ip -brief addr show
  echo "--- hostapd/dnsmasq ---"
  systemctl is-active hostapd dnsmasq 2>&1 || true
  echo "--- wpa_supplicant (home Wi-Fi client) ---"
  systemctl is-active wpa_supplicant 2>&1 || true
}

enable_hotspot() {
  require_confirmation
  echo "Installing hostapd/dnsmasq if needed..."
  sudo apt-get update -y
  sudo apt-get install -y hostapd dnsmasq

  echo "Stopping services before reconfiguration..."
  sudo systemctl stop hostapd dnsmasq 2>/dev/null || true
  sudo systemctl stop wpa_supplicant 2>/dev/null || true

  if [[ ! -f "${DHCPCD_BACKUP}" ]]; then
    sudo cp "${DHCPCD_CONF}" "${DHCPCD_BACKUP}"
  fi
  if ! grep -q "# BEGIN demo-hotspot" "${DHCPCD_CONF}" 2>/dev/null; then
    {
      echo "# BEGIN demo-hotspot"
      echo "interface wlan0"
      echo "static ip_address=${AP_IP}"
      echo "nohook wpa_supplicant"
      echo "# END demo-hotspot"
    } | sudo tee -a "${DHCPCD_CONF}" >/dev/null
  fi

  if [[ ! -f "${DNSMASQ_BACKUP}" ]] && [[ -f "${DNSMASQ_CONF_DST}" ]]; then
    sudo cp "${DNSMASQ_CONF_DST}" "${DNSMASQ_BACKUP}"
  fi
  sudo cp "${PROJECT_ROOT}/services/demo-hotspot/dnsmasq.conf" "${DNSMASQ_CONF_DST}"
  sudo mkdir -p /etc/hostapd
  sudo cp "${PROJECT_ROOT}/services/demo-hotspot/hostapd.conf" "${HOSTAPD_CONF_DST}"
  sudo sed -i 's|^#\?DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd

  echo "Restarting dhcpcd to apply the static AP address..."
  sudo systemctl restart dhcpcd
  sleep 3
  sudo systemctl unmask hostapd 2>/dev/null || true
  sudo systemctl start dnsmasq
  sudo systemctl start hostapd

  echo
  echo "Hotspot should be up: SSID from services/demo-hotspot/hostapd.conf, Pi at ${AP_IP%%/*}."
  echo "CHANGE THE DEFAULT PASSPHRASE in services/demo-hotspot/hostapd.conf before Naples."
  status
}

disable_hotspot() {
  require_confirmation
  echo "Stopping hotspot services..."
  sudo systemctl stop hostapd dnsmasq 2>/dev/null || true
  sudo systemctl disable hostapd dnsmasq 2>/dev/null || true

  if [[ -f "${DHCPCD_BACKUP}" ]]; then
    sudo cp "${DHCPCD_BACKUP}" "${DHCPCD_CONF}"
  else
    sudo sed -i '/# BEGIN demo-hotspot/,/# END demo-hotspot/d' "${DHCPCD_CONF}"
  fi
  if [[ -f "${DNSMASQ_BACKUP}" ]]; then
    sudo cp "${DNSMASQ_BACKUP}" "${DNSMASQ_CONF_DST}"
  fi

  echo "Restarting networking to rejoin the home Wi-Fi..."
  sudo systemctl restart dhcpcd
  sudo systemctl start wpa_supplicant 2>/dev/null || true
  sleep 5
  status
}

case "${ACTION}" in
  status) status ;;
  enable) enable_hotspot ;;
  disable) disable_hotspot ;;
  *) usage ;;
esac
