# Architecture

## High-Level Components

- Next.js UI
  - Reads/writes data through backend API
  - Uses SSE for `/ask` and `/agents/:name/run`

- Backend API (`src/server.ts`)
  - Entity CRUD
  - Run orchestration
  - Env var management
  - Provider abstraction
  - NemoClaw CLI boundary
  - Audit logging

- Local storage layer (filesystem)
  - Human-readable files (YAML/JSON)
  - No database dependency

## Data Layout

- `agents/`            Agent definitions (`*.yaml`)
- `skills/`            Skill definitions (`*.json`)
- `squads/`            Squad definitions (`*.yaml`)
- `projects/`          Per-project directories and artifacts
- `runs/`              Run records (`*.json`)
- `artifacts/`         Artifact metadata + global artifact files
- `memory/`            Reserved runtime memory storage
- `logs/`              Audit log JSONL
- `config/`            Runtime settings (non-secret)
- `~/.nemoclaw/config/env.local` Managed environment variables (secret-capable, outside repo)

## Core Runtime Flow

1. Run is created (`queued`)
2. Execution starts (`running`)
3. Agent + squad selected
4. Delegation decision recorded
5. Model invocation executes
6. Optional skill invocation via NemoClaw CLI
7. Artifacts persisted
8. Run finalized (`completed` or `failed`)
9. Audit entry appended

## Squads and Delegation

Squads support:
- `strict`
- `open`
- `dynamic` (default)

Dynamic mode selects a runtime delegation pattern and records that decision in run steps.

## Environment Management

Primary source:
- `~/.nemoclaw/config/env.local`

Optional override:
- `AGENTPLATFORM_ENV_LOCAL_PATH`

Optional secondary sync:
- `~/.zshrc` managed block

Backend guarantees:
- returns current values from managed env file for keys present in that file
- writes updates idempotently through `/env`
- for managed keys, file values are loaded as the primary source of truth

## Provider Abstraction

`GET /models` resolves provider via `MODEL_PROVIDER`.

Current implementation:
- OpenRouter

Future providers can conform to the same model-catalog shape.

## NemoClaw Integration Boundary

Skill execution is delegated to host CLI only when configured.

Boundary contract:
- input: skill name + task
- execution: host process via configured CLI path
- output: captured stdout/stderr
- trace: recorded in run steps and audit logs

## Security and Shareability

- No machine-specific secrets in code
- managed env file is outside repo by default (`~/.nemoclaw/config/env.local`)
- runtime data directories are gitignored
- `.env.example` documents required variables
