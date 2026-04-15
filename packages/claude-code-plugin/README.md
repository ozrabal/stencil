# @stencil-pm/claude-code-plugin

Claude Code adapter for Stencil template management.

## Overview

This package provides Skills for Claude Code that expose Stencil template operations as slash commands. It delegates business logic to `@stencil-pm/core` via shell scripts.

## Skills

| Skill          | Command           | Description                            |
| -------------- | ----------------- | -------------------------------------- |
| stencil        | `/stencil`        | Main router — dispatches to sub-skills |
| stencil-init   | `/stencil-init`   | Initialize Stencil in a project        |
| stencil-create | `/stencil-create` | Create a new template                  |
| stencil-list   | `/stencil-list`   | List all templates                     |
| stencil-show   | `/stencil-show`   | Show template details                  |
| stencil-run    | `/stencil-run`    | Render a template                      |
| stencil-delete | `/stencil-delete` | Delete a template                      |

## Status

Under active development. Skills are stubs — no business logic implemented yet.
