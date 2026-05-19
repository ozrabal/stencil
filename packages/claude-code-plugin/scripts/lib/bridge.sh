#!/usr/bin/env bash

set -euo pipefail

readonly STENCIL_BRIDGE_UNAVAILABLE_CODE="STENCIL_ADAPTER_BRIDGE_UNAVAILABLE"
readonly STENCIL_BRIDGE_UNAVAILABLE_EXIT=69

stencil::bridge_unavailable() {
  local command="$1"
  local template_name="$2"
  shift 2 || true
  local forwarded_args=("$@")
  local args_summary=""

  if ((${#forwarded_args[@]} > 0)); then
    args_summary="$(stencil::join_by ' ' "${forwarded_args[@]}")"
  fi

  stencil::stderr "[${STENCIL_BRIDGE_UNAVAILABLE_CODE}] Claude Code adapter bridge is not implemented yet."
  stencil::stderr "command=${command}"
  if [[ -n "${template_name}" ]]; then
    stencil::stderr "template=${template_name}"
  fi
  if [[ -n "${args_summary}" ]]; then
    stencil::stderr "args=${args_summary}"
  fi

  exit "${STENCIL_BRIDGE_UNAVAILABLE_EXIT}"
}

stencil::invoke_bridge() {
  local command="$1"
  local template_name="$2"
  shift 2 || true

  stencil::bridge_unavailable "${command}" "${template_name}" "$@"
}
