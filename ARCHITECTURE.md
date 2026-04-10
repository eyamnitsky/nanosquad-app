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
- `config/`            Runtime config + env file

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
- `config/env.local`

Optional secondary sync:
- `~/.zshrc` managed block

Backend guarantees:
- never returns raw secret values from `/env`
- writes updates idempotently through `/env`

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
- `config/env.local` is gitignored
- runtime data directories are gitignored
- `.env.example` documents required variables
