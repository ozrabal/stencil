#!/usr/bin/env bash

set -euo pipefail

readonly STENCIL_BRIDGE_RUNTIME_EXIT=70

stencil::resolve_core_cli() {
  if [[ -n "${STENCIL_CORE_CLI_PATH:-}" ]]; then
    if [[ -f "${STENCIL_CORE_CLI_PATH}" ]]; then
      printf '%s\n' "${STENCIL_CORE_CLI_PATH}"
      return 0
    fi

    stencil::die "${STENCIL_BRIDGE_RUNTIME_EXIT}" \
      "Configured STENCIL_CORE_CLI_PATH does not exist: ${STENCIL_CORE_CLI_PATH}"
  fi

  local monorepo_cli="${STENCIL_PACKAGE_ROOT}/../core/dist/cli.js"
  if [[ -f "${monorepo_cli}" ]]; then
    printf '%s\n' "${monorepo_cli}"
    return 0
  fi

  local packaged_cli="${STENCIL_PACKAGE_ROOT}/node_modules/@stencil-pm/core/dist/cli.js"
  if [[ -f "${packaged_cli}" ]]; then
    printf '%s\n' "${packaged_cli}"
    return 0
  fi

  stencil::die "${STENCIL_BRIDGE_RUNTIME_EXIT}" \
    "Stencil core CLI was not found. Build @stencil-pm/core or install the workspace dependency."
}

stencil::invoke_bridge() {
  local command="$1"
  local template_name="$2"
  shift 2 || true
  local cli_path
  cli_path="$(stencil::resolve_core_cli)"

  case "${command}" in
    init | list | detect-context)
      exec node "${cli_path}" "${command}"
      ;;
    show | validate | delete)
      exec node "${cli_path}" "${command}" "${template_name}"
      ;;
    run)
      exec node "${cli_path}" resolve "${template_name}" "$@"
      ;;
    resolve)
      exec node "${cli_path}" resolve "${template_name}" "$@"
      ;;
    create)
      exec node "${cli_path}" create --stdin-json
      ;;
    *)
      stencil::die 64 "Unsupported bridge command: ${command}"
      ;;
  esac
}
