#!/usr/bin/env bash
# ==============================================================================
# AstroPi Zero-Friction Raspberry Pi 4 (64-bit ARM64 Linux) Installer
# ==============================================================================
# Provisions:
#   1. libgphoto2, gphoto2, Python 3 venv, rawpy, pyerfa, FastAPI, Uvicorn
#   2. astap_cli (ARM64) + W08 (wide-field) and D20 star catalogs (/opt/astap)
#   3. udev rules & gvfs-gphoto2-volume-monitor suppression for Canon EOS M200
#   4. Zero-config Samba (SMB3) share (\\astro.local\captures) + Avahi mDNS
#   5. exFAT / NTFS USB 3.0 external SSD support + udisks2
#   6. NetworkManager Wi-Fi Auto-Hotspot fallback ("AstroPi-Field" @ 10.42.0.1)
#   7. systemd service (astropi.service) with MemoryMax=512M
# ==============================================================================

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run deploy/install.sh as root: sudo bash deploy/install.sh"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="/opt/astropi"
DATA_DIR="/var/lib/astropi"
ASTAP_DIR="/opt/astap"

echo "[1/7] Installing system packages (libgphoto2, Samba, Avahi, exFAT, NetworkManager)..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip python3-dev build-essential pkg-config \
  gphoto2 libgphoto2-dev libusb-1.0-0-dev \
  samba avahi-daemon avahi-utils \
  exfatprogs ntfs-3g udisks2 \
  network-manager curl ca-certificates unzip git rsync

echo "[2/7] Masking OS gvfs PTP auto-mounters and installing Canon EOS M200 udev rule..."
systemctl --global mask gvfs-gphoto2-volume-monitor.service 2>/dev/null || true
pkill -f gvfs-gphoto2-volume-monitor 2>/dev/null || true
cp "${REPO_ROOT}/deploy/udev/99-astropi-gphoto2.rules" /etc/udev/rules.d/99-astropi-gphoto2.rules
udevadm control --reload-rules && udevadm trigger

echo "[3/7] Provisioning ASTAP CLI and G05 (3°–20° FOV) star database in ${ASTAP_DIR}..."
bash "${REPO_ROOT}/deploy/ensure_astap.sh"

echo "[4/7] Deploying AstroPi application to ${INSTALL_ROOT} and creating Python venv..."
mkdir -p "${INSTALL_ROOT}" "${DATA_DIR}/captures" "/dev/shm/astropi"
echo "${REPO_ROOT}" > "${INSTALL_ROOT}/.git_source"
cp -r "${REPO_ROOT}/backend" "${REPO_ROOT}/frontend" "${REPO_ROOT}/deploy" "${INSTALL_ROOT}/"

python3 -m venv "${INSTALL_ROOT}/venv"
"${INSTALL_ROOT}/venv/bin/pip" install --upgrade pip
"${INSTALL_ROOT}/venv/bin/pip" install -r "${INSTALL_ROOT}/backend/requirements.txt"

echo "[5/7] Configuring Zero-Config Samba (SMB3) share and Avahi mDNS (astro.local)..."
hostnamectl set-hostname astro || true
cp "${REPO_ROOT}/deploy/smb.conf.astropi" /etc/samba/smb.conf.astropi
if ! grep -q "smb.conf.astropi" /etc/samba/smb.conf; then
  echo "include = /etc/samba/smb.conf.astropi" >> /etc/samba/smb.conf
fi
systemctl enable --now avahi-daemon smbd

echo "[6/7] Configuring NetworkManager Wi-Fi Auto-Hotspot fallback (AstroPi-Field)..."
if command -v nmcli >/dev/null 2>&1; then
  if ! nmcli connection show "AstroPi-Field" >/dev/null 2>&1; then
    nmcli connection add type wifi ifname wlan0 con-name "AstroPi-Field" autoconnect yes ssid "AstroPi-Field" \
      802-11-wireless.mode ap 802-11-wireless.band bg ipv4.method shared ipv4.addresses 10.42.0.1/24 \
      wifi-sec.key-mgmt wpa-psk wifi-sec.psk "astropi1234" \
      connection.autoconnect-priority -100 || true
  fi
fi

echo "[7/7] Installing and starting astropi.service..."
cp "${REPO_ROOT}/deploy/astropi.service" /etc/systemd/system/astropi.service
systemctl daemon-reload
systemctl enable --now astropi.service

echo "=============================================================================="
echo "AstroPi installation complete!"
echo "  • Web UI:      http://astro.local:8000 (or http://10.42.0.1:8000 in field)"
echo "  • Root CA:     http://astro.local:8000/api/system/ca.crt"
echo "  • SMB Share:   \\\\astro.local\\captures  |  smb://astro.local/captures"
echo "=============================================================================="
