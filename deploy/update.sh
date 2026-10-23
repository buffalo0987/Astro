#!/usr/bin/env bash
# ==============================================================================
# AstroPi Fast Update Script for Raspberry Pi 4
# ==============================================================================
# Usage:
#   sudo bash deploy/update.sh
#
# What it does:
#   1. Fetches and pulls the latest Git commits (if inside a Git repository)
#   2. Fast-syncs code changes (backend, frontend/dist, deploy) to /opt/astropi
#   3. Updates Python virtual environment dependencies if requirements changed
#   4. Restarts the systemd daemon (astropi.service)
#   5. Verifies service health and reports active status
#
# Note: User data (/var/lib/astropi: database, captures, TLS certs) is preserved.
# ==============================================================================

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[-] Please run as root: sudo bash deploy/update.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_ROOT="/opt/astropi"

echo "=============================================================================="
echo "                   AstroPi Software Update Utility                            "
echo "=============================================================================="

# 1. Pull Git updates if inside a git work tree
if [ -d "${REPO_ROOT}/.git" ]; then
  echo "[1/4] Checking for git updates in ${REPO_ROOT}..."
  ORIGINAL_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
  if [ -n "${ORIGINAL_USER}" ] && [ "${ORIGINAL_USER}" != "root" ]; then
    su - "${ORIGINAL_USER}" -c "cd '${REPO_ROOT}' && git pull" || echo "  -> Note: git pull failed or device is offline; proceeding with local repository code."
  else
    (cd "${REPO_ROOT}" && git pull) || echo "  -> Note: git pull failed or device is offline; proceeding with local repository code."
  fi
else
  echo "[1/4] No .git directory found; syncing from current local files..."
fi

COMMIT_HASH="$(cd "${REPO_ROOT}" && git rev-parse --short HEAD 2>/dev/null || echo 'local')"
echo "  -> Target revision: ${COMMIT_HASH}"

# 2. Sync application files to /opt/astropi
echo "[2/4] Syncing application code to ${INSTALL_ROOT}..."
mkdir -p "${INSTALL_ROOT}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude '__pycache__' --exclude '*.pyc' "${REPO_ROOT}/backend/" "${INSTALL_ROOT}/backend/"
  rsync -a --delete "${REPO_ROOT}/frontend/dist/" "${INSTALL_ROOT}/frontend/dist/"
  rsync -a --delete "${REPO_ROOT}/deploy/" "${INSTALL_ROOT}/deploy/"
else
  cp -r "${REPO_ROOT}/backend" "${INSTALL_ROOT}/"
  cp -r "${REPO_ROOT}/frontend/dist" "${INSTALL_ROOT}/frontend/"
  cp -r "${REPO_ROOT}/deploy" "${INSTALL_ROOT}/"
fi

# Ensure correct permissions
chmod +x "${INSTALL_ROOT}/deploy/"*.sh 2>/dev/null || true

# 3. Update Python dependencies if needed
echo "[3/4] Checking Python dependencies..."
if [ -f "${INSTALL_ROOT}/venv/bin/pip" ]; then
  "${INSTALL_ROOT}/venv/bin/pip" install -q -r "${INSTALL_ROOT}/backend/requirements.txt"
else
  echo "  -> Virtualenv not found. Creating at ${INSTALL_ROOT}/venv..."
  python3 -m venv "${INSTALL_ROOT}/venv"
  "${INSTALL_ROOT}/venv/bin/pip" install -q --upgrade pip
  "${INSTALL_ROOT}/venv/bin/pip" install -q -r "${INSTALL_ROOT}/backend/requirements.txt"
fi

# 4. Reload and restart systemd service
echo "[4/4] Restarting astropi.service..."
systemctl daemon-reload
systemctl restart astropi.service

# Verification check
sleep 1.5
if systemctl is-active --quiet astropi.service; then
  echo "=============================================================================="
  echo "  [SUCCESS] AstroPi successfully updated to revision ${COMMIT_HASH}!"
  echo "  Service Status: ACTIVE (running)"
  echo "  Web UI:         http://astro.local:8000"
  echo "  Secure PWA:     https://astro.local:8443 (or https://10.42.0.1:8443)"
  echo "=============================================================================="
else
  echo "=============================================================================="
  echo "  [WARNING] Service did not start cleanly. Inspect recent logs with:"
  echo "            journalctl -u astropi.service -n 50 --no-pager"
  echo "=============================================================================="
  exit 1
fi
