#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Shared transport only: normalize command shape, validate adapter-local rules,
# and forward the command contract to the future Node/core bridge.
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/args.sh"
source "${SCRIPT_DIR}/lib/bridge.sh"

main() {
  local command="${1-}"
  if [[ -z "${command}" || "${command}" == "help" || "${command}" == "--help" || "${command}" == "-h" ]]; then
    stencil::print_help
    exit 0
  fi

  shift

  case "${command}" in
    init | list)
      if (($# > 0)); then
        stencil::die 64 "Command \"${command}\" does not accept extra arguments."
      fi
      stencil::invoke_bridge "${command}" ""
      ;;
    create | show | delete | validate)
      if (($# == 0)); then
        stencil::die 64 "Missing template name for command \"${command}\"."
      fi
      local template_name="$1"
      shift
      if (($# > 0)); then
        stencil::die 64 "Command \"${command}\" accepts only one template name argument."
      fi
      stencil::invoke_bridge "${command}" "${template_name}"
      ;;
    run)
      if (($# == 0)); then
        stencil::die 64 "Missing template name for command \"run\"."
      fi
      local template_name="$1"
      shift
      if (($# > 0)); then
        stencil::validate_key_value_tokens "$@"
      fi
      stencil::invoke_bridge "${command}" "${template_name}" "$@"
      ;;
    resolve)
      if (($# == 0)); then
        stencil::die 64 "Missing template name for command \"resolve\"."
      fi
      local template_name="$1"
      shift
      stencil::invoke_bridge "${command}" "${template_name}" "$@"
      ;;
    detect-context)
      if (($# > 0)); then
        stencil::die 64 "Command \"detect-context\" does not accept extra arguments."
      fi
      stencil::invoke_bridge "${command}" ""
      ;;
    *)
      stencil::die 64 "Unknown stencil command: ${command}. Run /stencil help for usage."
      ;;
  esac
}

main "$@"
