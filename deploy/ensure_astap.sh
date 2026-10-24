#!/usr/bin/env bash
# ==============================================================================
# Ensure ASTAP CLI + G05 Star Database (3°–20° FOV for 180mm f/4.5) are ready
# ==============================================================================
set -uo pipefail

ASTAP_DIR="/opt/astap"
mkdir -p "${ASTAP_DIR}"
ARCH="$(uname -m)"

has_astap_bin() {
  command -v astap_cli >/dev/null 2>&1 || [[ -x "/opt/astap/astap_cli" ]] || [[ -x "/usr/local/bin/astap_cli" ]]
}

has_180mm_catalog() {
  compgen -G "${ASTAP_DIR}/g05*.290" >/dev/null 2>&1 || \
  compgen -G "${ASTAP_DIR}/d05*.290" >/dev/null 2>&1 || \
  compgen -G "${ASTAP_DIR}/d20*.290" >/dev/null 2>&1 || \
  compgen -G "${ASTAP_DIR}/d50*.290" >/dev/null 2>&1 || \
  compgen -G "${ASTAP_DIR}/h18*.1476" >/dev/null 2>&1 || \
  compgen -G "/usr/share/astap/g05*.290" >/dev/null 2>&1 || \
  compgen -G "/usr/share/astap/d05*.290" >/dev/null 2>&1 || \
  compgen -G "/usr/share/astap/d20*.290" >/dev/null 2>&1
}

# 1. Ensure astap_cli binary is installed
if ! has_astap_bin; then
  echo "  -> Installing astap_cli plate-solver..."
  apt-get update -qq 2>/dev/null || true
  apt-get install -y --no-install-recommends astap-cli 2>/dev/null || true

  if ! has_astap_bin && [[ "${ARCH}" == "aarch64" || "${ARCH}" == "arm64" ]]; then
    for URL in \
      "https://downloads.sourceforge.net/project/astap-program/linux_installer/astap-cli_arm64.deb" \
      "https://www.hnsky.org/astap-cli_arm64.deb"; do
      if curl -fL --connect-timeout 10 --max-time 120 -o /tmp/astap-cli_arm64.deb "${URL}" 2>/dev/null; then
        if [[ -s /tmp/astap-cli_arm64.deb ]] && [[ $(stat -c%s /tmp/astap-cli_arm64.deb 2>/dev/null || echo 0) -gt 50000 ]]; then
          dpkg -i /tmp/astap-cli_arm64.deb 2>/dev/null || apt-get install -f -y -qq 2>/dev/null || true
          rm -f /tmp/astap-cli_arm64.deb
          break
        fi
      fi
      rm -f /tmp/astap-cli_arm64.deb
    done
  fi
fi

if [[ -x "/opt/astap/astap_cli" ]] && ! command -v astap_cli >/dev/null 2>&1; then
  ln -sf /opt/astap/astap_cli /usr/local/bin/astap_cli 2>/dev/null || true
fi

# 2. Ensure G05 (3°–20° FOV, optimal for TPO 180mm 4.74°x7.09° FOV) star catalog is installed
if ! has_180mm_catalog; then
  echo "  -> Downloading ASTAP G05 star database (3°–20° FOV, ideal for 180mm lens)..."
  for DB_URL in \
    "https://downloads.sourceforge.net/project/astap-program/star_databases/g05_star_database.deb" \
    "https://www.hnsky.org/g05_star_database.deb"; do
    if curl -fL --connect-timeout 10 --max-time 300 -o /tmp/g05_star_database.deb "${DB_URL}" 2>/dev/null; then
      if [[ -s /tmp/g05_star_database.deb ]] && [[ $(stat -c%s /tmp/g05_star_database.deb 2>/dev/null || echo 0) -gt 1000000 ]]; then
        dpkg -i /tmp/g05_star_database.deb 2>/dev/null || apt-get install -f -y -qq 2>/dev/null || true
        rm -f /tmp/g05_star_database.deb
        break
      fi
    fi
    rm -f /tmp/g05_star_database.deb
  done
fi

if has_astap_bin && has_180mm_catalog; then
  echo "  -> ASTAP plate-solver & 180mm star catalog: READY ✓"
else
  echo "  -> [NOTE] ASTAP or G05 star catalog not yet installed (connect Pi to Wi-Fi and re-run deploy/update.sh)."
fi
