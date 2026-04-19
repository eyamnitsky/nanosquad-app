# Nanosquad App

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
- Settings (`/config/`) + managed env (`~/.nemoclaw/config/env.local`)

This repository is built to be GitHub-safe:
- no hardcoded secrets
- env and runtime state are decoupled from code
- runtime data is ignored by `.gitignore`

## Key Features

- Agent management
  - Create/edit agents, prompts, models, skills, and routing flags (`global_coordinator`, `telegram_entrypoint`)
- Squad management
  - Create squads, assign members, set orchestrator, set Telegram contact agent, and edit shared squad lore in the UI
  - Delegation modes: `strict`, `open`, `dynamic`
- Project operations
  - Projects include notes, runs, artifacts, and recurring tasks
  - Recurring tasks support weekday/hour scheduling plus optional monitoring guidance and preferred tools
- Run orchestration and observability
  - `/ask` routes tasks to the right agent/squad
  - Runs are grouped in the Runs tab so delegated sub-runs are easier to inspect
  - Detailed run steps + audit logs are persisted to local files
- Environment and provider management
  - Settings UI manages `~/.nemoclaw/config/env.local`
  - Model catalog comes from provider abstraction (`MODEL_PROVIDER`, default `openrouter`)
- NemoClaw integration
  - Skills can execute through NemoClaw CLI when configured
  - Web search skill uses Brave API key from managed env

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

## Default Bootstrapped Workspace

On first boot (when no local agents/squads/skills exist), the app seeds:

- Agents:
  - `researcher` (research-focused)
  - `coder` (implementation-focused)
- Squad:
  - `core` (default cross-functional squad)
  - members: `researcher`, `coder`
  - lead/orchestrator: `researcher`
  - delegation mode/policy: `dynamic`
  - Telegram contact agent: `researcher`
- Skills:
  - `web_search`
  - `code_exec`

This default is meant to give a safe starting baseline. You can fully customize or replace it in the UI.

## Marco (Coordinator Pattern)

`Marco` is the recommended coordinator profile for multi-squad orchestration and Telegram-first operation.

In this pattern, Marco is configured as:

- `global_coordinator: true`  
  Can coordinate work across squads when explicitly targeted.
- `telegram_entrypoint: true`  
  Primary inbound agent for Telegram-routed requests.

Typical usage:

1. Message Marco on Telegram with the task and target squad/context.
2. Marco routes/delegates to the appropriate squad members.
3. Delegation and downstream activity are captured in grouped runs.

Notes:
- Marco is a configuration pattern, not a hardcoded special-case in source.
- You can use any name, but keeping `marco` makes team operations clearer.

## Working with Projects

Projects are the container for ongoing work context (notes), execution history (runs), and outputs (artifacts).

### In the UI

1. Create a project from the **Projects** tab.
2. Select the owning squad (required).
3. Add description and notes.
4. Open the project and use **Dispatch a task** to run work in project context.

Behavior:
- Projects are grouped by squad in the Projects view.
- Project detail shows squad ownership.
- Tasks dispatched from a project carry both `project_id` and `squad_id`.

### Through Marco (Telegram)

Marco has the `project_ops` skill enabled and can work with projects directly when you mention them.

Use patterns like:
- `Use Test project and draft a launch checklist.`
- `In Test project, ask Gail and Sam to collaborate on messaging.`
- `Create project "Q2 Outbound Sprint" in squad liazon. Notes: Focus on founder ICP and weekly cadence.`

Behavior:
- If a known project name/id is mentioned, Marco resolves it and uses project notes as context.
- If you ask to create a project, Marco can create it with squad ownership.
- Imported Telegram runs are matched to project mentions and persisted with `project_id` when a match is found.

### What gets persisted

- Project metadata: `projects/<project_id>/project.json`
- Project recurring tasks: `projects/<project_id>/recurring-tasks.json`
- Project-linked runs: `runs/<run_id>.json` with `project_id`
- Project artifacts: `projects/<project_id>/artifacts/`

### Best practices

- Use exact project names in Telegram for best matching.
- Include squad explicitly when creating a project.
- Keep project notes current so Marco has reliable operating context.

## Environment Variables

Managed env vars are primarily stored in:

- `~/.nemoclaw/config/env.local`

This keeps NemoClaw self-sufficient as the source of runtime credentials.
The management app reads/writes this file through backend APIs.

Optional override:
- `AGENTPLATFORM_ENV_LOCAL_PATH` (absolute path)

Key examples:
- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `BRAVE_SEARCH_API_KEY`
- `MODEL_PROVIDER` (default `openrouter`)
- `NEMOCLAW_CLI_PATH`

### Env management behavior

- `GET /env` returns full values for keys present in `~/.nemoclaw/config/env.local`
- `PUT /env` updates values in `~/.nemoclaw/config/env.local` (or override path)
- `POST /env/test` validates provider integrations
- For managed keys, values in the managed env file take precedence over inherited process env.

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

This installs `~/Library/LaunchAgents/com.nemoclaw.backend.plist` and `com.nemoclaw.ui.plist`.
Both are configured with `RunAtLoad` + `KeepAlive`, so they start automatically after login/reboot and restart if they crash.

Helpful commands:

```bash
./scripts/status-launch-agents.sh
./scripts/uninstall-launch-agents.sh
```

Manual checks:

```bash
launchctl print gui/$(id -u)/com.nemoclaw.backend | grep 'state ='
launchctl print gui/$(id -u)/com.nemoclaw.ui | grep 'state ='
```

Default ports:
- UI: `3000`
- API: `8000`

## GitHub Publishing Safety

This repo is set up so local runtime data and personal configs stay out of git:
- managed secrets file (`~/.nemoclaw/config/env.local`) is external to this repo
- local `.env` and `config/settings.json` are ignored
- no agent YAMLs are tracked in git (`agents/` is structure-only)
- only baseline squad config tracked is `squads/core.yaml`
- additional local agents/squads created on your machine are ignored by default

## Setup and Ops Docs

- [SETUP.md](./SETUP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
