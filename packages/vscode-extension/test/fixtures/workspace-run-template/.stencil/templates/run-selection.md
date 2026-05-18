---
name: run-selection
description: Selection-aware smoke fixture
version: 1
placeholders:
  - name: focus_area
    description: Focus area
    required: true
    default: performance
---

Review this {{$ctx.active_selection}} snippet for {{input:focus_area:performance}} issues.
