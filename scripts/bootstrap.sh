#!/usr/bin/env bash
set -euo pipefail

# Simple bootstrapper that ensures a shared repo-level virtualenv exists and
# installs both backend and worker dependencies into it.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -d "${VENV_DIR}" ]; then
    echo "Creating virtual environment at ${VENV_DIR}"
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1090
source "${VENV_DIR}/bin/activate"

pip install --upgrade pip
pip install -r "${ROOT_DIR}/requirements.dev.txt"

deactivate

cat <<'MSG'

Repo virtualenv ready.
Activate it with: source .venv/bin/activate

MSG
