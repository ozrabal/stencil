#!/usr/bin/env bash

set -euo pipefail

readonly STENCIL_PUBLIC_COMMANDS=(init create list show run delete)

stencil::print_help() {
  cat <<'EOF'
Stencil commands:
  /stencil help
  /stencil init
  /stencil create <name>
  /stencil list
  /stencil show <name>
  /stencil run <name> [key=value ...]
  /stencil delete <name>

Direct commands:
  /stencilinit
  /stencilcreate <name>
  /stencillist
  /stencilshow <name>
  /stencilrun <name> [key=value ...]
  /stencildelete <name>
EOF
}

stencil::is_public_command() {
  local candidate="$1"
  local command

  for command in "${STENCIL_PUBLIC_COMMANDS[@]}"; do
    if [[ "${command}" == "${candidate}" ]]; then
      return 0
    fi
  done

  return 1
}

stencil::requires_template_name() {
  local command="$1"

  case "${command}" in
    create | show | run | delete | resolve | validate)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

stencil::allows_extra_tokens() {
  local command="$1"

  case "${command}" in
    run | resolve)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

stencil::validate_key_value_tokens() {
  local token

  for token in "$@"; do
    if [[ "${token}" != *=* ]]; then
      stencil::die 64 "Invalid run argument \"${token}\". Expected key=value."
    fi

    if [[ -z "${token%%=*}" ]]; then
      stencil::die 64 "Invalid run argument \"${token}\". Expected a non-empty key before =."
    fi
  done
}
