# Setup Guide

## Requirements

- macOS (for LaunchAgent automation scripts)
- Node.js (>= 20)
- pnpm

## 1. Install

```bash
pnpm install
```

## 2. Configure Environment

1. Copy template:

```bash
cp .env.example .env
```

2. Configure runtime env using the app (Settings -> Environment), or edit:

- `~/.nemoclaw/config/env.local`

Optional override path:
- set `AGENTPLATFORM_ENV_LOCAL_PATH` in `.env`

Do not commit your real env file.

## 3. Run Locally

### Development

```bash
pnpm dev:all
```

### Production-style (manual)

Terminal 1:

```bash
pnpm backend:start
```

Terminal 2:

```bash
pnpm build
pnpm start:ui
```

## 4. Install Startup Services (Persist Through Restart)

Build UI first for production start:

```bash
pnpm build
```

Install and start LaunchAgents:

```bash
./scripts/install-launch-agents.sh
```

Check status:

```bash
./scripts/status-launch-agents.sh
```

No sudo is required for these user-level LaunchAgents.

## 5. Logs

Service logs:
- `logs/backend.launch.out.log`
- `logs/backend.launch.err.log`
- `logs/ui.launch.out.log`
- `logs/ui.launch.err.log`

Audit trail:
- `logs/audit.jsonl`

## 6. Remove Startup Services

```bash
./scripts/uninstall-launch-agents.sh
```
