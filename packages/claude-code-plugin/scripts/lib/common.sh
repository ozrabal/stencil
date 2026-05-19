#!/usr/bin/env bash

set -euo pipefail

readonly STENCIL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STENCIL_SCRIPTS_DIR="$(cd "${STENCIL_LIB_DIR}/.." && pwd)"
readonly STENCIL_PACKAGE_ROOT="$(cd "${STENCIL_SCRIPTS_DIR}/.." && pwd)"

stencil::stderr() {
  printf '%s\n' "$*" >&2
}

stencil::die() {
  local exit_code="$1"
  shift
  stencil::stderr "$*"
  exit "${exit_code}"
}

stencil::join_by() {
  local delimiter="$1"
  shift || true
  local first=1
  local value

  for value in "$@"; do
    if [[ "${first}" -eq 1 ]]; then
      printf '%s' "${value}"
      first=0
    else
      printf '%s%s' "${delimiter}" "${value}"
    fi
  done
}
