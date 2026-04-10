# NemoClaw Agent Platform

Agent-centric control plane for NemoClaw with a Next.js UI and a file-backed backend service.

## Overview

Primary entities:
- Agents (`/agents/*.yaml`)
- Skills (`/skills/*.json`)
- Squads (`/squads/*.yaml`)
- Projects (`/projects/<id>/project.json`)
- Runs (`/runs/<id>.json`)
- Artifacts (`/artifacts/*.json` + project/global artifact files)
- Logs (`/logs/audit.jsonl`)
- Settings + env management (`/config/`)

This repository is built to be GitHub-safe:
- no hardcoded secrets
- env and runtime state are decoupled from code
- runtime data is ignored by `.gitignore`

## Architecture

- UI: Next.js app (this repo root, `app/`, `components/`, `lib/`)
- Backend API: Express TypeScript service (`/src/server.ts`, default `:8000`)
- Storage: local filesystem directories in repo root

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details.

## Quick Start

1. Install dependencies

```bash
pnpm install
```

2. Create local env file for app runtime

```bash
cp .env.example .env
```

3. Start both UI + backend in development

```bash
pnpm dev:all
```

4. Open
- UI: <http://localhost:3000>
- Backend health: <http://localhost:8000/health>

## Environment Variables

Managed env vars are primarily stored in:

- `config/env.local`

Key examples:
- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `BRAVE_SEARCH_API_KEY`
- `MODEL_PROVIDER` (default `openrouter`)
- `NEMOCLAW_CLI_PATH`

### Env management behavior

- `GET /env` returns masked status only (never raw secrets)
- `PUT /env` updates values in `config/env.local`
- `POST /env/test` validates provider integrations

## Optional .zshrc Sync

Shell sync is optional and secondary. If `AGENTPLATFORM_SYNC_ZSHRC=true`, managed vars are mirrored into:

```sh
# >>> AgentPlatform env vars >>>
export ...
# <<< AgentPlatform env vars <<<
```

in `~/.zshrc`.

## Model Provider Abstraction

`GET /models` resolves through provider abstraction using `MODEL_PROVIDER`.

Current provider:
- `openrouter`

Returned model records include:
- `id`
- `provider`
- `context_window`
- `input_price`
- `output_price`

## NemoClaw Integration

Skills can be delegated to NemoClaw CLI when configured:
- set `NEMOCLAW_CLI_PATH`
- optional `NEMOCLAW_SKILL_TEMPLATE`

The backend records delegation decisions and execution trace into run steps and audit logs.

## Run Persistence + Audit

For each execution:
- run status transitions (`queued -> running -> completed/failed`)
- trace steps are persisted
- artifacts are written to project/global storage
- audit records are appended to `logs/audit.jsonl`

## Always-On Startup (macOS)

User-level LaunchAgents are included (no sudo needed):

```bash
./scripts/install-launch-agents.sh
```

Helpful commands:

```bash
./scripts/status-launch-agents.sh
./scripts/uninstall-launch-agents.sh
```

## Setup and Ops Docs

- [SETUP.md](./SETUP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
