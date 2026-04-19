import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

const execFileAsync = promisify(execFile)

function expandHomePath(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  return input
}

const ROOT = process.cwd()
const PATHS = {
  agents: path.join(ROOT, 'agents'),
  skills: path.join(ROOT, 'skills'),
  squads: path.join(ROOT, 'squads'),
  projects: path.join(ROOT, 'projects'),
  runs: path.join(ROOT, 'runs'),
  artifacts: path.join(ROOT, 'artifacts'),
  memory: path.join(ROOT, 'memory'),
  logs: path.join(ROOT, 'logs'),
  config: path.join(ROOT, 'config'),
}

const SETTINGS_PATH = path.join(PATHS.config, 'settings.json')
const NEMOCLAW_HOME = path.resolve(
  expandHomePath(process.env.NEMOCLAW_HOME?.trim() || path.join(os.homedir(), '.nemoclaw'))
)
const DEFAULT_MANAGED_ENV_PATH = path.join(NEMOCLAW_HOME, 'config', 'env.local')
const LEGACY_ENV_LOCAL_PATH = path.join(PATHS.config, 'env.local')
const ENV_LOCAL_PATH = path.resolve(
  expandHomePath(process.env.AGENTPLATFORM_ENV_LOCAL_PATH?.trim() || DEFAULT_MANAGED_ENV_PATH)
)
const ONBOARD_SESSION_PATH = path.join(NEMOCLAW_HOME, 'onboard-session.json')
const AUDIT_LOG_PATH = path.join(PATHS.logs, 'audit.jsonl')
const LOGS_DOWNLOAD_PATH = path.join(PATHS.logs, 'audit.jsonl')

const ENV_BLOCK_START = '# >>> AgentPlatform env vars >>>'
const ENV_BLOCK_END = '# <<< AgentPlatform env vars <<<'
const NEMOCLAW_WORKSPACE_PATH = process.env.NEMOCLAW_WORKSPACE_PATH?.trim() || '/sandbox/.openclaw-data/workspace'
const NEMOCLAW_REGISTRY_FILENAME = 'NANOSQUAD_REGISTRY.md'
const IDENTITY_GUIDANCE_START = '<!-- nanosquad-registry-guidance:start -->'
const IDENTITY_GUIDANCE_END = '<!-- nanosquad-registry-guidance:end -->'
const NEMOCLAW_AGENT_SYNC_TEMPLATE_DOCKERFILE_PATH = path.resolve(
  expandHomePath(process.env.NEMOCLAW_AGENT_SYNC_TEMPLATE_DOCKERFILE?.trim() || path.join(NEMOCLAW_HOME, 'source', 'Dockerfile'))
)
const NEMOCLAW_AGENT_SYNC_OUTPUT_DOCKERFILE_PATH = path.resolve(
  expandHomePath(process.env.NEMOCLAW_AGENT_SYNC_DOCKERFILE?.trim() || path.join(NEMOCLAW_HOME, 'source', 'Dockerfile.nanosquad'))
)
const NEMOCLAW_AGENT_SYNC_LOG_PATH = path.join(PATHS.logs, 'nemoclaw-agent-sync.log')
const NEMOCLAW_AGENT_SYNC_DEBOUNCE_MS = Number(process.env.NEMOCLAW_AGENT_SYNC_DEBOUNCE_MS ?? '4000')
const NEMOCLAW_AGENT_SYNC_TIMEOUT_MS = Number(process.env.NEMOCLAW_AGENT_SYNC_TIMEOUT_SECONDS ?? '1800') * 1000
const NEMOCLAW_RUN_SYNC_MIN_INTERVAL_MS = Number(process.env.NEMOCLAW_RUN_SYNC_MIN_INTERVAL_MS ?? '6000')
const NEMOCLAW_RUN_SYNC_TIMEOUT_MS = Number(process.env.NEMOCLAW_RUN_SYNC_TIMEOUT_SECONDS ?? '20') * 1000
const PROJECT_RECURRING_TASKS_FILENAME = 'recurring-tasks.json'
const RECURRING_TASK_TICK_MS = Number(process.env.RECURRING_TASK_TICK_SECONDS ?? '30') * 1000

dotenv.config({ path: path.join(ROOT, '.env') })

interface Agent {
  name: string
  role: string
  system_prompt: string
  model: string
  fallback_model?: string
  skills: string[]
  max_tokens?: number
  temperature?: number
  status: 'idle' | 'running'
  squad_id?: string
  global_coordinator?: boolean
  telegram_entrypoint?: boolean
}

interface Skill {
  name: string
  description: string
  code: string
  agents: string[]
}

interface Squad {
  id: string
  name: string
  description: string
  lore: string
  color: string
  orchestrator: string
  members: string[]
  telegram_contact_agent?: string
  delegation_policy: 'sequential' | 'parallel' | 'vote' | 'dynamic'
  delegation_mode: 'strict' | 'open' | 'dynamic'
  created_at: string
}

interface Project {
  id: string
  name: string
  description: string
  notes?: string
  squad_id?: string
  created_at: string
  updated_at: string
  run_count: number
  artifact_count: number
}

type RecurringTaskUnit = 'minutes' | 'hours' | 'days'
type RecurringWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

interface RecurringTask {
  id: string
  project_id: string
  title: string
  task: string
  monitoring_guidance?: string
  tools: string[]
  agent?: string
  squad_id?: string
  every_value: number
  every_unit: RecurringTaskUnit
  weekdays: RecurringWeekday[]
  run_hour: number
  run_minute: number
  start_at?: string
  enabled: boolean
  last_run_at?: string
  next_run_at: string
  last_status?: 'success' | 'failed'
  last_error?: string
  created_at: string
  updated_at: string
}

type RunStatus = 'queued' | 'running' | 'completed' | 'failed'

interface RunStep {
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  started_at?: string
  completed_at?: string
  timestamp?: string
  type?:
    | 'run_created'
    | 'agent_selected'
    | 'squad_selected'
    | 'skill_invoked'
    | 'artifact_created'
    | 'completed'
    | 'failed'
    | 'fallback'
  title?: string
  description?: string
  agent?: string
  skill?: string
}

interface Run {
  id: string
  task: string
  status: RunStatus
  agent: string
  agents_involved: string[]
  squad?: string
  project_id?: string
  created_at: string
  completed_at?: string
  duration_seconds?: number
  duration_ms?: number
  orchestrator_summary?: string
  final_output?: string
  steps: RunStep[]
  artifacts: Array<{ id: string; title: string; type: ArtifactType; path: string; preview: string }>
}

type ArtifactType = 'text' | 'markdown' | 'json' | 'code' | 'csv' | 'html'

interface Artifact {
  id: string
  title: string
  type: ArtifactType
  run_id: string
  project_id?: string
  agent: string
  created_at: string
  preview: string
  path: string
  content: string
}

interface Settings {
  default_model: string
  dispatcher_model: string
  openrouter_api_key_set: boolean
  http_referer: string
  app_title: string
}

interface AuditEntry {
  id: string
  timestamp: string
  run_id: string
  agent: string
  squad?: string
  project_id?: string
  model_used: string
  skill?: string
  duration_ms?: number
  task: string
  output: string
}

interface OnboardSessionSnapshot {
  sandboxName?: string
  provider?: string
  model?: string
  endpointUrl?: string | null
  credentialEnv?: string | null
  preferredInferenceApi?: string | null
  policyPresets?: string[]
}

interface NemoclawRuntimeSyncStatus {
  enabled: boolean
  status: 'idle' | 'queued' | 'running' | 'success' | 'failed'
  queue_depth: number
  last_trigger?: string
  last_requested_at?: string
  last_started_at?: string
  last_finished_at?: string
  last_result_message?: string
  last_error_message?: string
  last_agent_count?: number
}

interface OpenClawSessionSummary {
  key: string
  sessionId: string
  agentId: string
  model?: string
  updatedAt?: number
  kind?: string
}

interface OpenClawSessionsPayload {
  sessions?: OpenClawSessionSummary[]
}

interface TranscriptToolCall {
  name: string
  arguments: Record<string, unknown>
}

interface TranscriptMessageRecord {
  role?: string
  content?: unknown
  model?: string
  toolName?: string
  details?: Record<string, unknown>
}

interface TranscriptEvent {
  type?: string
  id?: string
  timestamp?: string
  message?: TranscriptMessageRecord
}

const DEFAULT_SETTINGS: Settings = {
  default_model: 'openai/gpt-4o-mini',
  dispatcher_model: 'openai/gpt-4o-mini',
  openrouter_api_key_set: false,
  http_referer: 'http://localhost:3000',
  app_title: 'NemoClaw Control',
}

const MODEL_FALLBACK = [
  {
    id: 'openai/gpt-4o-mini',
    provider: 'OpenAI',
    description: 'Fast and cost-efficient general model.',
    context: 128000,
    context_window: 128000,
    input_price: 0.15,
    output_price: 0.6,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'Anthropic',
    description: 'Balanced reasoning and coding model.',
    context: 200000,
    context_window: 200000,
    input_price: 3,
    output_price: 15,
  },
  {
    id: 'google/gemini-2.5-pro',
    provider: 'Google',
    description: 'Large context model for complex planning and analysis.',
    context: 1000000,
    context_window: 1000000,
    input_price: 1.25,
    output_price: 5,
  },
]

const ENV_SCHEMA = [
  {
    service: 'openrouter',
    key: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    description: 'Used for model calls and model catalog access via OpenRouter.',
    required: true,
  },
  {
    service: 'openrouter',
    key: 'OPENROUTER_HTTP_REFERER',
    label: 'OpenRouter HTTP Referer',
    description: 'Optional referer sent to OpenRouter for usage attribution.',
    required: false,
  },
  {
    service: 'openrouter',
    key: 'OPENROUTER_X_TITLE',
    label: 'OpenRouter App Title',
    description: 'Optional title sent in OpenRouter requests.',
    required: false,
  },
  {
    service: 'telegram',
    key: 'TELEGRAM_BOT_TOKEN',
    label: 'Telegram Bot Token',
    description: 'Bot token used for Telegram integration testing and notifications.',
    required: false,
  },
  {
    service: 'brave',
    key: 'BRAVE_SEARCH_API_KEY',
    label: 'Brave Search API Key',
    description: 'API key used by web search skills.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_API_KEY',
    label: 'Brevo API Key',
    description: 'API key for Brevo transactional/email integrations.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_SMTP_HOST',
    label: 'Brevo SMTP Host',
    description: 'SMTP hostname for Brevo relay.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_SMTP_PORT',
    label: 'Brevo SMTP Port',
    description: 'SMTP port for Brevo relay.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_SMTP_LOGIN',
    label: 'Brevo SMTP Login',
    description: 'SMTP login/username for Brevo relay.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_TO_EMAIL',
    label: 'Brevo Default Recipient Email',
    description: 'Default recipient email used by Brevo flows.',
    required: false,
  },
  {
    service: 'brevo',
    key: 'BREVO_TO_NAME',
    label: 'Brevo Default Recipient Name',
    description: 'Default recipient display name used by Brevo flows.',
    required: false,
  },
  {
    service: 'general',
    key: 'MODEL_PROVIDER',
    label: 'Model Provider',
    description: 'Default model provider abstraction key (default: openrouter).',
    required: false,
  },
  {
    service: 'general',
    key: 'NEMOCLAW_CLI_PATH',
    label: 'NemoClaw CLI Path',
    description: 'Absolute path to NemoClaw CLI executable for skill invocation.',
    required: false,
  },
  {
    service: 'general',
    key: 'NEMOCLAW_ENDPOINT_URL',
    label: 'NemoClaw Inference Endpoint',
    description: 'Optional OpenAI-compatible endpoint for local inference (for example Ollama).',
    required: false,
  },
  {
    service: 'general',
    key: 'AGENTPLATFORM_SYNC_ZSHRC',
    label: 'Sync to .zshrc',
    description: 'Set to true to mirror managed env vars into a dedicated ~/.zshrc block.',
    required: false,
  },
]

function nowIso(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function safeFileKey(input: string): string {
  const value = input.trim()
  if (!value || value.includes('/') || value.includes('..')) {
    throw new Error('Invalid identifier')
  }
  return value
}

function toJsonLine(entry: unknown): string {
  return `${JSON.stringify(entry)}\n`
}

function hashId(parts: string[]): string {
  return createHash('sha1').update(parts.join(':')).digest('hex').slice(0, 12)
}

function inferProviderFromModelId(id: string): string {
  const head = id.split('/')[0] ?? id
  return head.charAt(0).toUpperCase() + head.slice(1)
}

function inferArtifactType(task: string, output: string): ArtifactType {
  const lower = `${task}\n${output}`.toLowerCase()
  if (lower.includes('```json') || lower.trim().startsWith('{') || lower.trim().startsWith('[')) return 'json'
  if (lower.includes('```') || lower.includes('function ') || lower.includes('const ')) return 'code'
  if (lower.includes(',') && lower.includes('\n') && lower.includes('csv')) return 'csv'
  if (lower.includes('<html') || lower.includes('</')) return 'html'
  if (lower.includes('# ') || lower.includes('## ')) return 'markdown'
  return 'text'
}

function mapModeToPolicy(mode: 'strict' | 'open' | 'dynamic'): Squad['delegation_policy'] {
  if (mode === 'strict') return 'sequential'
  if (mode === 'open') return 'parallel'
  return 'dynamic'
}

function mapPolicyToMode(policy: Squad['delegation_policy']): Squad['delegation_mode'] {
  if (policy === 'dynamic') return 'dynamic'
  if (policy === 'sequential') return 'strict'
  return 'open'
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readText(filePath: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return fallback
  }
}

async function writeText(filePath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, value, 'utf8')
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readYamlFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return YAML.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, YAML.stringify(value), 'utf8')
}

async function loadEnvLocalMap(): Promise<Map<string, string>> {
  const exists = await pathExists(ENV_LOCAL_PATH)
  if (!exists) return new Map()
  const raw = await fs.readFile(ENV_LOCAL_PATH, 'utf8')
  const lines = raw.split(/\r?\n/)
  const map = new Map<string, string>()
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    map.set(key, value)
  }
  return map
}

async function writeEnvLocalMap(map: Map<string, string>): Promise<void> {
  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b))
  const lines = keys.map(key => `${key}=${map.get(key) ?? ''}`)
  const body = lines.length > 0 ? `${lines.join('\n')}\n` : ''
  await writeText(ENV_LOCAL_PATH, body)
}

async function maybeMigrateLegacyEnvLocal(): Promise<void> {
  if (path.resolve(ENV_LOCAL_PATH) === path.resolve(LEGACY_ENV_LOCAL_PATH)) return
  const [targetExists, legacyExists] = await Promise.all([
    pathExists(ENV_LOCAL_PATH),
    pathExists(LEGACY_ENV_LOCAL_PATH),
  ])
  if (targetExists || !legacyExists) return
  const legacyRaw = await readText(LEGACY_ENV_LOCAL_PATH, '')
  await writeText(ENV_LOCAL_PATH, legacyRaw)
}

async function hydrateProcessEnvFromLocal(): Promise<void> {
  const map = await loadEnvLocalMap()
  for (const [key, value] of map.entries()) {
    process.env[key] = value
  }
}

function isZshSyncEnabled(map: Map<string, string>): boolean {
  const value = map.get('AGENTPLATFORM_SYNC_ZSHRC') ?? process.env.AGENTPLATFORM_SYNC_ZSHRC ?? ''
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function shellQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function syncEnvToZshrc(map: Map<string, string>): Promise<void> {
  const zshrcPath = path.join(os.homedir(), '.zshrc')
  const existing = await readText(zshrcPath, '')
  const managedKeys = new Set(ENV_SCHEMA.map(v => v.key))
  const exportLines: string[] = []
  for (const [key, value] of map.entries()) {
    if (managedKeys.has(key) && value) {
      exportLines.push(`export ${key}=${shellQuote(value)}`)
    }
  }
  const block = [ENV_BLOCK_START, ...exportLines, ENV_BLOCK_END].join('\n')
  const pattern = new RegExp(`${ENV_BLOCK_START}[\\s\\S]*?${ENV_BLOCK_END}`, 'm')
  const next = pattern.test(existing)
    ? existing.replace(pattern, block)
    : [existing.trimEnd(), block].filter(Boolean).join('\n\n')
  await writeText(zshrcPath, `${next.trimEnd()}\n`)
}

async function ensureBaseStructure(): Promise<void> {
  await Promise.all([
    ...Object.values(PATHS).map(ensureDir),
    ensureDir(path.dirname(ENV_LOCAL_PATH)),
  ])
  await maybeMigrateLegacyEnvLocal()
  if (!(await pathExists(ENV_LOCAL_PATH))) {
    await writeText(ENV_LOCAL_PATH, '')
  }
  if (!(await pathExists(AUDIT_LOG_PATH))) {
    await writeText(AUDIT_LOG_PATH, '')
  }
  if (!(await pathExists(SETTINGS_PATH))) {
    await writeJsonFile(SETTINGS_PATH, DEFAULT_SETTINGS)
  }
}

async function seedDefaults(): Promise<void> {
  const agentFiles = (await fs.readdir(PATHS.agents)).filter(name => name.endsWith('.yaml'))
  if (agentFiles.length === 0) {
    await writeYamlFile(path.join(PATHS.agents, 'researcher.yaml'), {
      name: 'researcher',
      role: 'Researches topics and synthesizes findings.',
      system_prompt: 'You are a research-focused agent. Prioritize clear synthesis and citations.',
      model: 'openai/gpt-4o-mini',
      skills: ['web_search', 'summarize'],
      status: 'idle',
    })
    await writeYamlFile(path.join(PATHS.agents, 'coder.yaml'), {
      name: 'coder',
      role: 'Writes and reviews technical implementation plans and code.',
      system_prompt: 'You are a coding-focused agent. Provide concrete implementation guidance.',
      model: 'openai/gpt-4o-mini',
      skills: ['code_exec'],
      status: 'idle',
    })
  }

  const squadFiles = (await fs.readdir(PATHS.squads)).filter(name => name.endsWith('.yaml'))
  if (squadFiles.length === 0) {
    await writeYamlFile(path.join(PATHS.squads, 'core.yaml'), {
      name: 'core',
      description: 'Default cross-functional squad',
      lore: '',
      members: ['researcher', 'coder'],
      lead_agent: 'researcher',
      delegation_mode: 'dynamic',
      delegation_policy: 'dynamic',
      telegram_contact_agent: 'researcher',
      color: '#3b7ff5',
      created_at: nowIso(),
    })
  }

  const skillFiles = (await fs.readdir(PATHS.skills)).filter(name => name.endsWith('.json'))
  if (skillFiles.length === 0) {
    await writeJsonFile(path.join(PATHS.skills, 'web_search.json'), {
      name: 'web_search',
      description: 'Queries web search APIs and returns summarized results.',
      code: '# NemoClaw skill placeholder for web search',
    })
    await writeJsonFile(path.join(PATHS.skills, 'code_exec.json'), {
      name: 'code_exec',
      description: 'Runs code snippets in a controlled environment.',
      code: '# NemoClaw skill placeholder for code execution',
    })
  }
}

async function listAgents(): Promise<Agent[]> {
  const files = (await fs.readdir(PATHS.agents)).filter(name => name.endsWith('.yaml'))
  const agents = await Promise.all(files.map(async file => readYamlFile<Partial<Agent>>(path.join(PATHS.agents, file), {})))
  return agents
    .filter((a): a is Partial<Agent> & { name: string } => typeof a.name === 'string')
    .map<Agent>(a => ({
      name: a.name,
      role: a.role ?? '',
      system_prompt: a.system_prompt ?? '',
      model: a.model ?? DEFAULT_SETTINGS.default_model,
      fallback_model: a.fallback_model,
      skills: Array.isArray(a.skills) ? a.skills : [],
      max_tokens: a.max_tokens,
      temperature: a.temperature,
      status: (a.status === 'running' ? 'running' : 'idle') as Agent['status'],
      squad_id: a.squad_id,
      global_coordinator: Boolean(a.global_coordinator),
      telegram_entrypoint: Boolean(a.telegram_entrypoint),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function getAgent(name: string): Promise<Agent | null> {
  const safeName = safeFileKey(name)
  const filePath = path.join(PATHS.agents, `${safeName}.yaml`)
  if (!(await pathExists(filePath))) return null
  const raw = await readYamlFile<Partial<Agent>>(filePath, {})
  if (!raw.name) return null
  return {
    name: raw.name,
    role: raw.role ?? '',
    system_prompt: raw.system_prompt ?? '',
    model: raw.model ?? DEFAULT_SETTINGS.default_model,
    fallback_model: raw.fallback_model,
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    max_tokens: raw.max_tokens,
    temperature: raw.temperature,
    status: raw.status === 'running' ? 'running' : 'idle',
    squad_id: raw.squad_id,
    global_coordinator: Boolean(raw.global_coordinator),
    telegram_entrypoint: Boolean(raw.telegram_entrypoint),
  }
}

async function putAgent(name: string, payload: Partial<Agent>): Promise<Agent> {
  const current = await getAgent(name)
  const merged: Agent = {
    name: payload.name?.trim() || current?.name || name,
    role: payload.role ?? current?.role ?? '',
    system_prompt: payload.system_prompt ?? current?.system_prompt ?? '',
    model: payload.model ?? current?.model ?? DEFAULT_SETTINGS.default_model,
    fallback_model: payload.fallback_model ?? current?.fallback_model,
    skills: Array.isArray(payload.skills) ? payload.skills : current?.skills ?? [],
    max_tokens: payload.max_tokens ?? current?.max_tokens,
    temperature: payload.temperature ?? current?.temperature,
    status: payload.status === 'running' ? 'running' : current?.status ?? 'idle',
    squad_id: payload.squad_id ?? current?.squad_id,
    global_coordinator: payload.global_coordinator ?? current?.global_coordinator ?? false,
    telegram_entrypoint: payload.telegram_entrypoint ?? current?.telegram_entrypoint ?? false,
  }

  const oldKey = safeFileKey(name)
  const newKey = safeFileKey(merged.name)
  const oldPath = path.join(PATHS.agents, `${oldKey}.yaml`)
  const newPath = path.join(PATHS.agents, `${newKey}.yaml`)

  if (oldKey !== newKey && (await pathExists(oldPath))) {
    await fs.rename(oldPath, newPath)
  }

  await writeYamlFile(newPath, merged)
  return merged
}

async function deleteAgent(name: string): Promise<void> {
  const filePath = path.join(PATHS.agents, `${safeFileKey(name)}.yaml`)
  if (await pathExists(filePath)) {
    await fs.unlink(filePath)
  }

  const squads = await listSquads()
  for (const squad of squads) {
    if (!squad.members.includes(name) && squad.orchestrator !== name) continue
    const nextMembers = squad.members.filter(member => member !== name)
    const nextOrchestrator = squad.orchestrator === name ? (nextMembers[0] ?? '') : squad.orchestrator
    await writeSquad({
      ...squad,
      members: nextMembers,
      orchestrator: nextOrchestrator,
    })
  }
}

async function listSkills(): Promise<Skill[]> {
  const files = (await fs.readdir(PATHS.skills)).filter(name => name.endsWith('.json'))
  const rawSkills = await Promise.all(files.map(file => readJsonFile<Partial<Skill>>(path.join(PATHS.skills, file), {})))
  const agents = await listAgents()
  return rawSkills
    .filter((skill): skill is Partial<Skill> & { name: string } => typeof skill.name === 'string')
    .map(skill => ({
      name: skill.name,
      description: skill.description ?? '',
      code: skill.code ?? '',
      agents: agents.filter(agent => agent.skills.includes(skill.name)).map(agent => agent.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function putSkill(payload: Pick<Skill, 'name' | 'description' | 'code'>): Promise<Skill> {
  const name = safeFileKey(payload.name)
  const filePath = path.join(PATHS.skills, `${name}.json`)
  await writeJsonFile(filePath, {
    name,
    description: payload.description,
    code: payload.code,
  })
  const skills = await listSkills()
  const created = skills.find(skill => skill.name === name)
  if (!created) throw new Error('Failed to save skill')
  return created
}

async function deleteSkill(name: string): Promise<void> {
  const filePath = path.join(PATHS.skills, `${safeFileKey(name)}.json`)
  if (await pathExists(filePath)) {
    await fs.unlink(filePath)
  }

  const agents = await listAgents()
  await Promise.all(
    agents
      .filter(agent => agent.skills.includes(name))
      .map(agent => putAgent(agent.name, { skills: agent.skills.filter(skill => skill !== name) }))
  )
}

async function listSquads(): Promise<Squad[]> {
  const files = (await fs.readdir(PATHS.squads)).filter(name => name.endsWith('.yaml'))
  const raws = await Promise.all(files.map(file => readYamlFile<Record<string, unknown>>(path.join(PATHS.squads, file), {})))
  return raws
    .filter(raw => typeof raw.name === 'string')
    .map(raw => normalizeSquad(raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeSquad(raw: Record<string, unknown>): Squad {
  const name = String(raw.name ?? 'squad')
  const id = String(raw.id ?? slugify(name))
  const members = Array.isArray(raw.members) ? raw.members.map(member => String(member)) : []
  const delegationModeRaw = String(raw.delegation_mode ?? '').toLowerCase()
  const delegation_mode: Squad['delegation_mode'] =
    delegationModeRaw === 'strict' || delegationModeRaw === 'open' || delegationModeRaw === 'dynamic'
      ? delegationModeRaw
      : mapPolicyToMode(String(raw.delegation_policy ?? 'dynamic') as Squad['delegation_policy'])
  const delegationPolicyRaw = String(raw.delegation_policy ?? '').toLowerCase()
  const delegation_policy: Squad['delegation_policy'] =
    delegationPolicyRaw === 'sequential' ||
    delegationPolicyRaw === 'parallel' ||
    delegationPolicyRaw === 'vote' ||
    delegationPolicyRaw === 'dynamic'
      ? delegationPolicyRaw
      : mapModeToPolicy(delegation_mode)

  return {
    id,
    name,
    description: String(raw.description ?? ''),
    lore: String(raw.lore ?? ''),
    color: String(raw.color ?? '#3b7ff5'),
    orchestrator: String(raw.lead_agent ?? raw.orchestrator ?? members[0] ?? ''),
    members,
    telegram_contact_agent: raw.telegram_contact_agent ? String(raw.telegram_contact_agent) : undefined,
    delegation_policy,
    delegation_mode,
    created_at: String(raw.created_at ?? nowIso()),
  }
}

async function writeSquad(squad: Squad): Promise<void> {
  const id = safeFileKey(squad.id || slugify(squad.name))
  const filePath = path.join(PATHS.squads, `${id}.yaml`)
  await writeYamlFile(filePath, {
    id,
    name: squad.name,
    description: squad.description,
    lore: squad.lore,
    members: squad.members,
    lead_agent: squad.orchestrator,
    telegram_contact_agent: squad.telegram_contact_agent,
    delegation_mode: squad.delegation_mode,
    delegation_policy: squad.delegation_policy,
    color: squad.color,
    created_at: squad.created_at,
  })
}

async function getSquad(id: string): Promise<Squad | null> {
  const safeId = safeFileKey(id)
  const directFile = path.join(PATHS.squads, `${safeId}.yaml`)
  if (await pathExists(directFile)) {
    return normalizeSquad(await readYamlFile<Record<string, unknown>>(directFile, {}))
  }
  const squads = await listSquads()
  return squads.find(squad => squad.id === id || slugify(squad.name) === id) ?? null
}

async function putSquad(id: string, payload: Partial<Squad>): Promise<Squad> {
  const existing = await getSquad(id)
  const effectiveName = payload.name?.trim() || existing?.name || id
  const effectiveId = payload.id?.trim() || existing?.id || slugify(effectiveName)

  const merged: Squad = {
    id: effectiveId,
    name: effectiveName,
    description: payload.description ?? existing?.description ?? '',
    lore: payload.lore ?? existing?.lore ?? '',
    color: payload.color ?? existing?.color ?? '#3b7ff5',
    orchestrator: payload.orchestrator ?? existing?.orchestrator ?? '',
    members: Array.isArray(payload.members) ? payload.members : existing?.members ?? [],
    telegram_contact_agent: payload.telegram_contact_agent ?? existing?.telegram_contact_agent,
    delegation_policy: payload.delegation_policy ?? existing?.delegation_policy ?? 'dynamic',
    delegation_mode: payload.delegation_mode ?? mapPolicyToMode(payload.delegation_policy ?? existing?.delegation_policy ?? 'dynamic'),
    created_at: existing?.created_at ?? nowIso(),
  }

  if (merged.orchestrator && !merged.members.includes(merged.orchestrator)) {
    merged.members = [merged.orchestrator, ...merged.members]
  }
  if (merged.telegram_contact_agent && !merged.members.includes(merged.telegram_contact_agent)) {
    const contactAgent = await getAgent(merged.telegram_contact_agent)
    if (!contactAgent?.global_coordinator) {
      merged.members = [merged.telegram_contact_agent, ...merged.members]
    }
  }

  await writeSquad(merged)
  if (existing && existing.id !== merged.id) {
    const oldPath = path.join(PATHS.squads, `${safeFileKey(existing.id)}.yaml`)
    if (await pathExists(oldPath)) await fs.unlink(oldPath)
  }
  return merged
}

async function deleteSquad(id: string): Promise<void> {
  const squad = await getSquad(id)
  if (!squad) return
  const filePath = path.join(PATHS.squads, `${safeFileKey(squad.id)}.yaml`)
  if (await pathExists(filePath)) {
    await fs.unlink(filePath)
  }
}

function deriveProjectSquadId(explicitSquadId: string | undefined, runs: Run[], projectId: string): string | undefined {
  const direct = explicitSquadId?.trim()
  if (direct) return direct

  const counts = new Map<string, number>()
  for (const run of runs) {
    if (run.project_id !== projectId) continue
    const squadId = run.squad?.trim()
    if (!squadId) continue
    counts.set(squadId, (counts.get(squadId) ?? 0) + 1)
  }

  let best: string | undefined
  let bestCount = 0
  for (const [squadId, count] of counts.entries()) {
    if (count > bestCount) {
      best = squadId
      bestCount = count
    }
  }
  return best
}

async function listProjects(): Promise<Project[]> {
  const entries = await fs.readdir(PATHS.projects, { withFileTypes: true })
  const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  const runs = await listRunsRaw()
  const artifacts = await listArtifactsRaw()

  const projects = await Promise.all(
    dirs.map(async dir => {
      const filePath = path.join(PATHS.projects, dir, 'project.json')
      const base = await readJsonFile<Partial<Project>>(filePath, {})
      if (!base.id || !base.name) return null
      const run_count = runs.filter(run => run.project_id === base.id).length
      const artifact_count = artifacts.filter(artifact => artifact.project_id === base.id).length
      return {
        id: base.id,
        name: base.name,
        description: base.description ?? '',
        notes: base.notes,
        squad_id: deriveProjectSquadId(base.squad_id, runs, base.id),
        created_at: base.created_at ?? nowIso(),
        updated_at: base.updated_at ?? base.created_at ?? nowIso(),
        run_count,
        artifact_count,
      } as Project
    })
  )

  return projects.filter((project): project is Project => Boolean(project)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

async function getProject(id: string): Promise<Project | null> {
  const safeId = safeFileKey(id)
  const filePath = path.join(PATHS.projects, safeId, 'project.json')
  if (!(await pathExists(filePath))) return null
  const base = await readJsonFile<Partial<Project>>(filePath, {})
  if (!base.id || !base.name) return null
  const runs = await listRunsRaw()
  const artifacts = await listArtifactsRaw()
  return {
    id: base.id,
    name: base.name,
    description: base.description ?? '',
    notes: base.notes,
    squad_id: deriveProjectSquadId(base.squad_id, runs, base.id),
    created_at: base.created_at ?? nowIso(),
    updated_at: base.updated_at ?? base.created_at ?? nowIso(),
    run_count: runs.filter(run => run.project_id === base.id).length,
    artifact_count: artifacts.filter(artifact => artifact.project_id === base.id).length,
  }
}

async function putProject(id: string, payload: Partial<Project>): Promise<Project> {
  const existing = await getProject(id)
  const nextId = payload.id?.trim() || existing?.id || id
  const nextName = payload.name?.trim() || existing?.name || 'Untitled Project'
  const createdAt = existing?.created_at ?? nowIso()
  const projectDir = path.join(PATHS.projects, safeFileKey(nextId))
  await ensureDir(path.join(projectDir, 'artifacts'))

  const nextProject: Project = {
    id: nextId,
    name: nextName,
    description: payload.description ?? existing?.description ?? '',
    notes: payload.notes ?? existing?.notes,
    squad_id:
      payload.squad_id !== undefined
        ? String(payload.squad_id ?? '').trim() || undefined
        : existing?.squad_id,
    created_at: createdAt,
    updated_at: nowIso(),
    run_count: existing?.run_count ?? 0,
    artifact_count: existing?.artifact_count ?? 0,
  }

  await writeJsonFile(path.join(projectDir, 'project.json'), nextProject)

  if (existing && existing.id !== nextProject.id) {
    const oldDir = path.join(PATHS.projects, safeFileKey(existing.id))
    if (await pathExists(oldDir)) {
      await fs.rm(oldDir, { recursive: true, force: true })
    }
  }

  const refreshed = await getProject(nextProject.id)
  if (!refreshed) throw new Error('Failed to read saved project')
  return refreshed
}

async function deleteProject(id: string): Promise<void> {
  const projectDir = path.join(PATHS.projects, safeFileKey(id))
  if (await pathExists(projectDir)) {
    await fs.rm(projectDir, { recursive: true, force: true })
  }
}

function recurringTasksFilePath(projectId: string): string {
  return path.join(PATHS.projects, safeFileKey(projectId), PROJECT_RECURRING_TASKS_FILENAME)
}

function normalizeRecurringUnit(value: unknown): RecurringTaskUnit {
  if (value === 'minutes' || value === 'hours' || value === 'days') return value
  return 'days'
}

function normalizeRecurringEveryValue(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.min(10_000, Math.max(1, Math.round(numeric)))
}

const WEEKDAY_KEYS: RecurringWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function normalizeRecurringWeekdays(value: unknown): RecurringWeekday[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<RecurringWeekday>()
  const days: RecurringWeekday[] = []
  for (const item of value) {
    const day = String(item ?? '').trim().toLowerCase() as RecurringWeekday
    if (!WEEKDAY_KEYS.includes(day)) continue
    if (seen.has(day)) continue
    seen.add(day)
    days.push(day)
  }
  return days
}

function normalizeRecurringHour(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 9
  return Math.min(23, Math.max(0, Math.round(numeric)))
}

function normalizeRecurringMinute(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(59, Math.max(0, Math.round(numeric)))
}

function normalizeRecurringTools(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tools: string[] = []
  for (const item of value) {
    const name = String(item ?? '').trim()
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    tools.push(name)
  }
  return tools.slice(0, 50)
}

function recurringUnitMs(unit: RecurringTaskUnit): number {
  if (unit === 'minutes') return 60_000
  if (unit === 'hours') return 60 * 60_000
  return 24 * 60 * 60_000
}

function nextRecurringRunAtInterval(baseIso: string, everyValue: number, everyUnit: RecurringTaskUnit): string {
  const baseMs = Date.parse(baseIso)
  const safeBaseMs = Number.isFinite(baseMs) ? baseMs : Date.now()
  const nextMs = safeBaseMs + normalizeRecurringEveryValue(everyValue) * recurringUnitMs(everyUnit)
  return new Date(nextMs).toISOString()
}

function weekdayIndex(day: RecurringWeekday): number {
  return WEEKDAY_KEYS.indexOf(day)
}

function nextRecurringRunAtWeekly(baseIso: string, weekdays: RecurringWeekday[], runHour: number, runMinute: number): string {
  const baseMs = Date.parse(baseIso)
  const base = Number.isFinite(baseMs) ? new Date(baseMs) : new Date()
  const targetDays: RecurringWeekday[] = weekdays.length > 0 ? weekdays : ['mon']

  let best: Date | null = null
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(base)
    candidate.setSeconds(0, 0)
    candidate.setDate(base.getDate() + offset)
    const day = candidate.getDay()
    const matches = targetDays.some(target => weekdayIndex(target) === day)
    if (!matches) continue

    candidate.setHours(runHour, runMinute, 0, 0)
    if (candidate.getTime() <= base.getTime()) continue
    if (!best || candidate.getTime() < best.getTime()) {
      best = candidate
    }
  }

  if (!best) {
    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 1)
    fallback.setHours(runHour, runMinute, 0, 0)
    return fallback.toISOString()
  }
  return best.toISOString()
}

function computeNextRecurringRunAt(task: Pick<RecurringTask, 'every_value' | 'every_unit' | 'weekdays' | 'run_hour' | 'run_minute'>, baseIso: string): string {
  if (task.weekdays.length > 0) {
    return nextRecurringRunAtWeekly(baseIso, task.weekdays, task.run_hour, task.run_minute)
  }
  return nextRecurringRunAtInterval(baseIso, task.every_value, task.every_unit)
}

function normalizeRecurringTask(record: Partial<RecurringTask>, projectId: string): RecurringTask | null {
  if (!record.id || typeof record.id !== 'string') return null
  if (!record.task || typeof record.task !== 'string') return null

  const every_unit = normalizeRecurringUnit(record.every_unit)
  const every_value = normalizeRecurringEveryValue(record.every_value)
  const weekdays = normalizeRecurringWeekdays(record.weekdays)
  const run_hour = normalizeRecurringHour(record.run_hour)
  const run_minute = normalizeRecurringMinute(record.run_minute)
  const created_at = typeof record.created_at === 'string' ? record.created_at : nowIso()
  const updated_at = typeof record.updated_at === 'string' ? record.updated_at : created_at
  const start_at = typeof record.start_at === 'string' && record.start_at.trim() ? record.start_at : undefined
  const nextBaseIso = start_at && Date.parse(start_at) > Date.now() ? start_at : nowIso()
  const nextFallback = computeNextRecurringRunAt(
    { every_value, every_unit, weekdays, run_hour, run_minute },
    nextBaseIso
  )

  return {
    id: record.id,
    project_id: projectId,
    title: typeof record.title === 'string' ? record.title : '',
    task: record.task.trim(),
    monitoring_guidance:
      typeof record.monitoring_guidance === 'string' && record.monitoring_guidance.trim()
        ? record.monitoring_guidance
        : undefined,
    tools: normalizeRecurringTools(record.tools),
    agent: typeof record.agent === 'string' && record.agent.trim() ? record.agent.trim() : undefined,
    squad_id: typeof record.squad_id === 'string' && record.squad_id.trim() ? record.squad_id.trim() : undefined,
    every_value,
    every_unit,
    weekdays,
    run_hour,
    run_minute,
    start_at,
    enabled: record.enabled !== false,
    last_run_at: typeof record.last_run_at === 'string' ? record.last_run_at : undefined,
    next_run_at:
      typeof record.next_run_at === 'string' && record.next_run_at.trim()
        ? record.next_run_at
        : nextFallback,
    last_status: record.last_status === 'failed' ? 'failed' : record.last_status === 'success' ? 'success' : undefined,
    last_error: typeof record.last_error === 'string' && record.last_error.trim() ? record.last_error : undefined,
    created_at,
    updated_at,
  }
}

async function listProjectRecurringTasks(projectId: string): Promise<RecurringTask[]> {
  const filePath = recurringTasksFilePath(projectId)
  const raw = await readJsonFile<Array<Partial<RecurringTask>>>(filePath, [])
  const tasks: RecurringTask[] = []
  for (const item of raw) {
    const normalized = normalizeRecurringTask(item, projectId)
    if (normalized) tasks.push(normalized)
  }
  return tasks.sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))
}

async function writeProjectRecurringTasks(projectId: string, tasks: RecurringTask[]): Promise<void> {
  const filePath = recurringTasksFilePath(projectId)
  await writeJsonFile(filePath, tasks)
}

async function createProjectRecurringTask(
  projectId: string,
  payload: Partial<RecurringTask>
): Promise<RecurringTask> {
  const taskText = String(payload.task ?? '').trim()
  if (!taskText) throw new Error('task is required')

  const every_unit = normalizeRecurringUnit(payload.every_unit)
  const every_value = normalizeRecurringEveryValue(payload.every_value)
  const weekdays = normalizeRecurringWeekdays(payload.weekdays)
  const run_hour = normalizeRecurringHour(payload.run_hour)
  const run_minute = normalizeRecurringMinute(payload.run_minute)
  const startAtRaw = typeof payload.start_at === 'string' ? payload.start_at.trim() : ''
  const startAtIso =
    startAtRaw && Number.isFinite(Date.parse(startAtRaw))
      ? new Date(Date.parse(startAtRaw)).toISOString()
      : undefined

  const now = nowIso()
  const nextBaseIso = startAtIso && Date.parse(startAtIso) > Date.now() ? startAtIso : now
  const next_run_at = computeNextRecurringRunAt(
    { every_value, every_unit, weekdays, run_hour, run_minute },
    nextBaseIso
  )

  const selectedTools = normalizeRecurringTools(payload.tools)
  if (selectedTools.length > 0) {
    const skillNames = new Set((await listSkills()).map(skill => skill.name))
    const unknownTools = selectedTools.filter(tool => !skillNames.has(tool))
    if (unknownTools.length > 0) {
      throw new Error(`Unknown tools: ${unknownTools.join(', ')}`)
    }
  }

  const task: RecurringTask = {
    id: `rt-${Date.now()}-${randomUUID().slice(0, 6)}`,
    project_id: projectId,
    title: String(payload.title ?? '').trim(),
    task: taskText,
    monitoring_guidance:
      typeof payload.monitoring_guidance === 'string' && payload.monitoring_guidance.trim()
        ? payload.monitoring_guidance.trim()
        : undefined,
    tools: selectedTools,
    agent: typeof payload.agent === 'string' && payload.agent.trim() ? payload.agent.trim() : undefined,
    squad_id: typeof payload.squad_id === 'string' && payload.squad_id.trim() ? payload.squad_id.trim() : undefined,
    every_value,
    every_unit,
    weekdays,
    run_hour,
    run_minute,
    start_at: startAtIso,
    enabled: payload.enabled !== false,
    next_run_at,
    created_at: now,
    updated_at: now,
  }

  const tasks = await listProjectRecurringTasks(projectId)
  tasks.push(task)
  await writeProjectRecurringTasks(projectId, tasks)
  return task
}

async function updateProjectRecurringTask(
  projectId: string,
  taskId: string,
  payload: Partial<RecurringTask>
): Promise<RecurringTask> {
  const tasks = await listProjectRecurringTasks(projectId)
  const index = tasks.findIndex(task => task.id === taskId)
  if (index < 0) throw new Error('Recurring task not found')

  const current = tasks[index]
  const every_unit = payload.every_unit ? normalizeRecurringUnit(payload.every_unit) : current.every_unit
  const every_value =
    payload.every_value !== undefined
      ? normalizeRecurringEveryValue(payload.every_value)
      : current.every_value
  const weekdays = payload.weekdays !== undefined ? normalizeRecurringWeekdays(payload.weekdays) : current.weekdays
  const run_hour = payload.run_hour !== undefined ? normalizeRecurringHour(payload.run_hour) : current.run_hour
  const run_minute = payload.run_minute !== undefined ? normalizeRecurringMinute(payload.run_minute) : current.run_minute

  let next_run_at = current.next_run_at
  if (typeof payload.next_run_at === 'string' && payload.next_run_at.trim()) {
    next_run_at = payload.next_run_at
  } else if (
    payload.every_unit !== undefined ||
    payload.every_value !== undefined ||
    payload.weekdays !== undefined ||
    payload.run_hour !== undefined ||
    payload.run_minute !== undefined
  ) {
    const base = current.last_run_at ?? nowIso()
    next_run_at = computeNextRecurringRunAt(
      { every_value, every_unit, weekdays, run_hour, run_minute },
      base
    )
  }

  const startAtRaw =
    payload.start_at === undefined
      ? current.start_at
      : typeof payload.start_at === 'string' && payload.start_at.trim() && Number.isFinite(Date.parse(payload.start_at))
        ? new Date(Date.parse(payload.start_at)).toISOString()
        : undefined

  let nextTools = current.tools
  if (payload.tools !== undefined) {
    const normalized = normalizeRecurringTools(payload.tools)
    if (normalized.length > 0) {
      const skillNames = new Set((await listSkills()).map(skill => skill.name))
      const unknownTools = normalized.filter(tool => !skillNames.has(tool))
      if (unknownTools.length > 0) {
        throw new Error(`Unknown tools: ${unknownTools.join(', ')}`)
      }
    }
    nextTools = normalized
  }

  const nextTask: RecurringTask = {
    ...current,
    title: payload.title !== undefined ? String(payload.title ?? '').trim() : current.title,
    task: payload.task !== undefined ? String(payload.task ?? '').trim() : current.task,
    monitoring_guidance:
      payload.monitoring_guidance !== undefined
        ? String(payload.monitoring_guidance ?? '').trim() || undefined
        : current.monitoring_guidance,
    tools: nextTools,
    agent:
      payload.agent !== undefined
        ? String(payload.agent ?? '').trim() || undefined
        : current.agent,
    squad_id:
      payload.squad_id !== undefined
        ? String(payload.squad_id ?? '').trim() || undefined
        : current.squad_id,
    every_value,
    every_unit,
    weekdays,
    run_hour,
    run_minute,
    start_at: startAtRaw,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled,
    last_run_at: payload.last_run_at !== undefined ? payload.last_run_at : current.last_run_at,
    next_run_at,
    last_status: payload.last_status !== undefined ? payload.last_status : current.last_status,
    last_error: payload.last_error !== undefined ? payload.last_error : current.last_error,
    updated_at: nowIso(),
  }

  if (!nextTask.task.trim()) {
    throw new Error('task is required')
  }

  tasks[index] = nextTask
  await writeProjectRecurringTasks(projectId, tasks)
  return nextTask
}

async function deleteProjectRecurringTask(projectId: string, taskId: string): Promise<void> {
  const tasks = await listProjectRecurringTasks(projectId)
  const filtered = tasks.filter(task => task.id !== taskId)
  await writeProjectRecurringTasks(projectId, filtered)
}

async function listAllProjectRecurringTasks(): Promise<RecurringTask[]> {
  const entries = await fs.readdir(PATHS.projects, { withFileTypes: true })
  const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  const all = await Promise.all(dirs.map(dir => listProjectRecurringTasks(dir).catch(() => [])))
  return all.flat()
}

const recurringTaskLocks = new Set<string>()
let recurringTaskTickInProgress = false

async function executeRecurringTask(task: RecurringTask): Promise<void> {
  const lockKey = `${task.project_id}:${task.id}`
  if (recurringTaskLocks.has(lockKey)) return
  recurringTaskLocks.add(lockKey)

  try {
    const contextChunks: string[] = []
    if (task.monitoring_guidance?.trim()) {
      contextChunks.push(`Monitoring guidance:\n${task.monitoring_guidance.trim()}`)
    }
    if (task.tools.length > 0) {
      contextChunks.push(`Preferred tools for this monitoring task: ${task.tools.join(', ')}`)
    }

    await runTask({
      task: task.task,
      preferredAgent: task.agent,
      project_id: task.project_id,
      preferredSquadId: task.squad_id,
      task_context: contextChunks.length > 0 ? contextChunks.join('\n\n') : undefined,
    })

    await updateProjectRecurringTask(task.project_id, task.id, {
      last_run_at: nowIso(),
      last_status: 'success',
      last_error: undefined,
      next_run_at: computeNextRecurringRunAt(task, nowIso()),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recurring task execution failed'
    await updateProjectRecurringTask(task.project_id, task.id, {
      last_run_at: nowIso(),
      last_status: 'failed',
      last_error: message,
      next_run_at: computeNextRecurringRunAt(task, nowIso()),
    }).catch(() => null)
    console.warn(`Recurring task ${task.id} failed: ${message}`)
  } finally {
    recurringTaskLocks.delete(lockKey)
  }
}

async function tickRecurringTasks(): Promise<void> {
  if (recurringTaskTickInProgress) return
  recurringTaskTickInProgress = true

  try {
    const tasks = await listAllProjectRecurringTasks()
    const now = Date.now()
    for (const task of tasks) {
      if (!task.enabled) continue
      const nextRunAt = Date.parse(task.next_run_at)
      if (!Number.isFinite(nextRunAt) || nextRunAt > now) continue
      void executeRecurringTask(task)
    }
  } finally {
    recurringTaskTickInProgress = false
  }
}

function startRecurringTaskScheduler(): void {
  setInterval(() => {
    void tickRecurringTasks()
  }, Math.max(5_000, RECURRING_TASK_TICK_MS))
  void tickRecurringTasks()
}

function runFilePath(id: string): string {
  return path.join(PATHS.runs, `${safeFileKey(id)}.json`)
}

async function saveRun(run: Run): Promise<void> {
  await writeJsonFile(runFilePath(run.id), run)
}

async function listRunsRaw(): Promise<Run[]> {
  const files = (await fs.readdir(PATHS.runs)).filter(name => name.endsWith('.json'))
  const runs = await Promise.all(files.map(file => readJsonFile<Run>(path.join(PATHS.runs, file), {} as Run)))
  return runs
    .filter(run => Boolean(run?.id))
    .map(run => ({
      ...run,
      steps: Array.isArray(run.steps) ? run.steps : [],
      artifacts: Array.isArray(run.artifacts) ? run.artifacts : [],
      agents_involved: Array.isArray(run.agents_involved) ? run.agents_involved : [run.agent].filter(Boolean),
      duration_ms:
        run.duration_ms ??
        (typeof run.duration_seconds === 'number' ? Math.round(run.duration_seconds * 1000) : undefined),
    }))
}

async function listRuns(query?: { agent?: string; project_id?: string; status?: RunStatus }): Promise<Run[]> {
  let runs = await listRunsRaw()
  if (query?.agent) {
    const agent = query.agent
    runs = runs.filter(run => run.agent === agent || run.agents_involved.includes(agent))
  }
  if (query?.project_id) {
    runs = runs.filter(run => run.project_id === query.project_id)
  }
  if (query?.status) {
    runs = runs.filter(run => run.status === query.status)
  }
  return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function getRunningAgentNames(): Promise<Set<string>> {
  try {
    const runningRuns = await listRuns({ status: 'running' })
    const activeAgents = new Set<string>()
    for (const run of runningRuns) {
      if (run.agent) activeAgents.add(run.agent)
      for (const involved of run.agents_involved ?? []) {
        if (involved) activeAgents.add(involved)
      }
    }
    return activeAgents
  } catch {
    return new Set<string>()
  }
}

let sandboxReadyCache: { value: boolean; checkedAt: number } = {
  value: false,
  checkedAt: 0,
}

const OPENSHELL_CANDIDATES = [
  process.env.OPENSHELL_BIN?.trim() || '',
  path.join(os.homedir(), '.local', 'bin', 'openshell'),
  '/opt/homebrew/bin/openshell',
  '/usr/local/bin/openshell',
  'openshell',
].filter(Boolean)

async function isSandboxReady(sandboxName: string): Promise<boolean> {
  const now = Date.now()
  if (now - sandboxReadyCache.checkedAt < 5000) {
    return sandboxReadyCache.value
  }

  for (const binary of OPENSHELL_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(binary, ['sandbox', 'list'], {
        timeout: 2500,
        maxBuffer: 1024 * 1024,
      })
      const lower = stdout.toLowerCase()
      const ready = lower.includes(sandboxName.toLowerCase()) && lower.includes('ready')
      sandboxReadyCache = {
        value: ready,
        checkedAt: now,
      }
      return ready
    } catch {
      // Try next binary candidate.
    }
  }

  sandboxReadyCache = {
    value: false,
    checkedAt: now,
  }
  return false
}

async function getAlwaysOnEntrypointAgents(agents: Agent[]): Promise<Set<string>> {
  const tokenSet = Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '').trim())
  if (!tokenSet) return new Set<string>()

  const envMap = await loadEnvLocalMap()
  const sandboxName =
    (envMap.get('NEMOCLAW_SANDBOX_NAME') ?? process.env.NEMOCLAW_SANDBOX_NAME ?? '').trim() || 'nemoclaw-base'
  const ready = await isSandboxReady(sandboxName)
  if (!ready) return new Set<string>()

  return new Set(
    agents
      .filter(agent => agent.telegram_entrypoint)
      .map(agent => agent.name)
  )
}

async function resolveNemoclawSandboxName(): Promise<string> {
  const envMap = await loadEnvLocalMap()
  return (envMap.get('NEMOCLAW_SANDBOX_NAME') ?? process.env.NEMOCLAW_SANDBOX_NAME ?? '').trim() || 'nemoclaw-base'
}

async function runOpenShellWithCandidates(
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {}
): Promise<void> {
  const shellEscapeArg = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`
  const isMissingBinaryError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('enoent')) return true
    if (message.includes('command not found')) return true
    if (message.includes('no such file or directory')) return true
    return false
  }

  let lastError: Error | null = null
  for (const binary of OPENSHELL_CANDIDATES) {
    const command = [binary, ...args].map(shellEscapeArg).join(' ')
    const detachedCommand = `${command} </dev/null`
    try {
      await execFileAsync('/bin/zsh', ['-lc', detachedCommand], {
        timeout: options.timeout ?? 15_000,
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
      })
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (!isMissingBinaryError(error)) break
    }
  }
  if (lastError) throw lastError
  throw new Error('No openshell binary available.')
}

async function runOpenShellCaptureWithCandidates(
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const shellEscapeArg = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`
  const isMissingBinaryError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('enoent')) return true
    if (message.includes('command not found')) return true
    if (message.includes('no such file or directory')) return true
    return false
  }

  let lastError: Error | null = null
  for (const binary of OPENSHELL_CANDIDATES) {
    const command = [binary, ...args].map(shellEscapeArg).join(' ')
    const detachedCommand = `${command} </dev/null`
    try {
      const output = await execFileAsync('/bin/zsh', ['-lc', detachedCommand], {
        timeout: options.timeout ?? 15_000,
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
      })
      return {
        stdout: String(output.stdout || ''),
        stderr: String(output.stderr || ''),
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (!isMissingBinaryError(error)) break
    }
  }
  if (lastError) throw lastError
  throw new Error('No openshell binary available.')
}

function parseJsonFromCommandOutput<T>(raw: string): T | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const objectStart = trimmed.indexOf('{')
    const objectEnd = trimmed.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      const objectCandidate = trimmed.slice(objectStart, objectEnd + 1)
      try {
        return JSON.parse(objectCandidate) as T
      } catch {
        return null
      }
    }
    return null
  }
}

function extractTranscriptText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  const chunks: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const typed = item as { type?: unknown; text?: unknown }
    if (typed.type === 'text' && typeof typed.text === 'string') {
      const next = typed.text.trim()
      if (next) chunks.push(next)
    }
  }
  return chunks.join('\n\n').trim()
}

function extractTranscriptToolCalls(content: unknown): TranscriptToolCall[] {
  if (!Array.isArray(content)) return []
  const calls: TranscriptToolCall[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const typed = item as { type?: unknown; name?: unknown; arguments?: unknown }
    if (typed.type !== 'toolCall') continue
    if (typeof typed.name !== 'string') continue
    const args = typed.arguments
    calls.push({
      name: typed.name,
      arguments: args && typeof args === 'object' ? (args as Record<string, unknown>) : {},
    })
  }
  return calls
}

function parseAgentFromSessionKey(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:([^:]+)/i)
  return match?.[1]?.trim() || null
}

function parseRuntimeSubagentEvent(raw: string): {
  sessionKey: string
  sessionId?: string
  task: string
  statusText: string
  result: string
  agent: string
  success: boolean
} | null {
  if (!raw.includes('[Internal task completion event]')) return null
  if (!raw.includes('<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>')) return null

  const sessionKeyMatch = raw.match(/session_key:\s*([^\n]+)/i)
  const taskMatch = raw.match(/task:\s*([^\n]+)/i)
  const statusMatch = raw.match(/status:\s*([^\n]+)/i)
  const sessionIdMatch = raw.match(/session_id:\s*([^\n]+)/i)
  const resultMatch = raw.match(/<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\n?([\s\S]*?)\n?<<<END_UNTRUSTED_CHILD_RESULT>>>/m)

  const sessionKey = sessionKeyMatch?.[1]?.trim()
  const task = taskMatch?.[1]?.trim()
  const statusText = statusMatch?.[1]?.trim() ?? 'unknown'
  const result = resultMatch?.[1]?.trim() ?? ''

  if (!sessionKey || !task) return null

  const agent = parseAgentFromSessionKey(sessionKey)
  if (!agent) return null

  return {
    sessionKey,
    sessionId: sessionIdMatch?.[1]?.trim() || undefined,
    task,
    statusText,
    result,
    agent,
    success: !/failed|error/i.test(statusText),
  }
}

function unwrapTelegramEnvelope(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.includes('[Internal task completion event]')) return ''

  const envelopePattern =
    /Conversation info \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/m
  const withoutEnvelope = trimmed.replace(envelopePattern, '').trim()
  return withoutEnvelope || trimmed
}

function cleanAssistantTranscriptText(raw: string): string {
  return raw.replace(/^\[\[reply_to_current\]\]\s*/i, '').trim()
}

function transcriptTimestamp(event: TranscriptEvent): string {
  const ts = event.timestamp
  if (typeof ts === 'string' && ts.trim()) return ts
  return nowIso()
}

function inferDelegatedAgentFromToolCall(call: TranscriptToolCall): string | null {
  if (call.name === 'sessions_spawn') {
    const agentId = call.arguments.agentId
    if (typeof agentId === 'string' && agentId.trim()) return agentId.trim()
  }
  if (call.name === 'sessions_send') {
    const sessionKey = call.arguments.sessionKey
    if (typeof sessionKey === 'string' && sessionKey.trim()) {
      return parseAgentFromSessionKey(sessionKey)
    }
  }
  return null
}

function inferDelegatedAgentFromToolResult(message: TranscriptMessageRecord): string | null {
  if (!message?.toolName || (message.toolName !== 'sessions_spawn' && message.toolName !== 'sessions_send')) {
    return null
  }
  const childSessionKey = message.details?.childSessionKey
  if (typeof childSessionKey === 'string' && childSessionKey.trim()) {
    const parsed = parseAgentFromSessionKey(childSessionKey)
    if (parsed) return parsed
  }
  const sessionKey = message.details?.sessionKey
  if (typeof sessionKey === 'string' && sessionKey.trim()) {
    const parsed = parseAgentFromSessionKey(sessionKey)
    if (parsed) return parsed
  }
  return null
}

function findPrimarySquadId(agentName: string, squads: Squad[]): string | undefined {
  return squads.find(squad => squad.members.includes(agentName))?.id
}

function canonicalAgentName(name: string, byLowerName: Map<string, string>): string {
  return byLowerName.get(name.toLowerCase()) ?? name.toLowerCase()
}

function resolveSessionAgentName(
  session: OpenClawSessionSummary,
  byLowerName: Map<string, string>,
  telegramEntrypointName?: string
): string {
  const fromSession = session.agentId || parseAgentFromSessionKey(session.key) || 'main'
  if (fromSession.toLowerCase() === 'main' && session.key.includes(':telegram:') && telegramEntrypointName) {
    return telegramEntrypointName
  }
  return canonicalAgentName(fromSession, byLowerName)
}

function buildImportedStep(
  timestamp: string,
  label: string,
  status: RunStep['status'],
  type: NonNullable<RunStep['type']>,
  extras: Partial<RunStep> = {}
): RunStep {
  return {
    label,
    status,
    type,
    timestamp,
    title: extras.title ?? label,
    description: extras.description,
    agent: extras.agent,
    skill: extras.skill,
    started_at: extras.started_at ?? (status !== 'pending' ? timestamp : undefined),
    completed_at: status === 'done' || status === 'error' ? timestamp : extras.completed_at,
  }
}

function parseTranscriptEvents(raw: string): TranscriptEvent[] {
  if (!raw.trim()) return []
  const events: TranscriptEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed) as TranscriptEvent)
    } catch {
      // Ignore malformed lines.
    }
  }
  return events
}

async function listOpenClawSessionsFromSandbox(sandboxName: string): Promise<OpenClawSessionSummary[]> {
  const { stdout } = await runOpenShellCaptureWithCandidates(
    [
      'sandbox',
      'exec',
      '--name',
      sandboxName,
      '--',
      'sh',
      '-lc',
      'NODE_NO_WARNINGS=1 openclaw sessions --json --all-agents',
    ],
    {
      timeout: NEMOCLAW_RUN_SYNC_TIMEOUT_MS,
    }
  )
  const parsed = parseJsonFromCommandOutput<OpenClawSessionsPayload>(stdout)
  if (!parsed?.sessions || !Array.isArray(parsed.sessions)) return []
  return parsed.sessions.filter(
    session =>
      typeof session?.key === 'string' &&
      typeof session?.sessionId === 'string' &&
      typeof session?.agentId === 'string'
  )
}

async function readOpenClawSessionTranscript(
  sandboxName: string,
  session: OpenClawSessionSummary
): Promise<string> {
  const candidates = [
    `/sandbox/.openclaw-data/agents/${session.agentId}/sessions/${session.sessionId}.jsonl`,
    `/sandbox/.openclaw/agents/${session.agentId}/sessions/${session.sessionId}.jsonl`,
  ]

  for (const remotePath of candidates) {
    try {
      const { stdout } = await runOpenShellCaptureWithCandidates(
        ['sandbox', 'exec', '--name', sandboxName, '--', 'cat', remotePath],
        {
          timeout: NEMOCLAW_RUN_SYNC_TIMEOUT_MS,
          maxBuffer: 1024 * 1024 * 24,
        }
      )
      if (stdout.trim()) return stdout
    } catch {
      // Try next candidate.
    }
  }
  return ''
}

let nemoclawRunsSyncInFlight: Promise<void> | null = null
let nemoclawRunsLastSyncedAt = 0

async function syncNemoclawRunsFromTranscripts(): Promise<void> {
  const sandboxName = await resolveNemoclawSandboxName()
  const ready = await isSandboxReady(sandboxName)
  if (!ready) return

  const [sessions, agents, squads] = await Promise.all([
    listOpenClawSessionsFromSandbox(sandboxName),
    listAgents(),
    listSquads(),
  ])
  if (sessions.length === 0) return

  const byLowerName = new Map(agents.map(agent => [agent.name.toLowerCase(), agent.name]))
  const telegramEntrypointName = agents.find(agent => agent.telegram_entrypoint)?.name

  const importedRuns = new Map<string, Run>()

  for (const session of sessions) {
    const transcriptRaw = await readOpenClawSessionTranscript(sandboxName, session)
    if (!transcriptRaw.trim()) continue

    const events = parseTranscriptEvents(transcriptRaw)
    if (events.length === 0) continue

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]
      if (event.type !== 'message' || event.message?.role !== 'user') continue

      const userText = extractTranscriptText(event.message.content)
      if (!userText) continue

      const runtimeCompletion = parseRuntimeSubagentEvent(userText)
      if (runtimeCompletion) {
        const childAgent = canonicalAgentName(runtimeCompletion.agent, byLowerName)
        const parentAgent = resolveSessionAgentName(session, byLowerName, telegramEntrypointName)
        const createdAt = transcriptTimestamp(event)
        const runId = `run-ext-${hashId([
          'subagent',
          session.sessionId,
          runtimeCompletion.sessionKey,
          event.id ?? createdAt,
        ])}`

        importedRuns.set(runId, {
          id: runId,
          task: runtimeCompletion.task,
          status: runtimeCompletion.success ? 'completed' : 'failed',
          agent: childAgent,
          agents_involved: [...new Set([parentAgent, childAgent])],
          squad: findPrimarySquadId(childAgent, squads),
          created_at: createdAt,
          completed_at: createdAt,
          duration_seconds: 0,
          duration_ms: 0,
          orchestrator_summary: `Imported delegated run from ${parentAgent} to ${childAgent}.`,
          final_output: runtimeCompletion.result || runtimeCompletion.statusText,
          steps: [
            buildImportedStep(createdAt, 'Run imported', 'done', 'run_created', {
              title: 'Run imported',
              description: 'Imported from NemoClaw subagent completion event.',
              agent: childAgent,
            }),
            buildImportedStep(createdAt, `Agent selected: ${childAgent}`, 'done', 'agent_selected', {
              title: 'Agent selected',
              description: 'Delegated subagent selected by orchestrator.',
              agent: childAgent,
            }),
            buildImportedStep(
              createdAt,
              runtimeCompletion.success ? 'Run completed' : 'Run failed',
              runtimeCompletion.success ? 'done' : 'error',
              runtimeCompletion.success ? 'completed' : 'failed',
              {
                title: runtimeCompletion.success ? 'Completed' : 'Failed',
                description: runtimeCompletion.statusText,
                agent: childAgent,
              }
            ),
          ],
          artifacts: [],
        })
        continue
      }

      const task = unwrapTelegramEnvelope(userText)
      if (!task) continue

      let nextUserIndex = events.length
      for (let pointer = index + 1; pointer < events.length; pointer += 1) {
        if (events[pointer].type === 'message' && events[pointer].message?.role === 'user') {
          nextUserIndex = pointer
          break
        }
      }

      const parentAgent = resolveSessionAgentName(session, byLowerName, telegramEntrypointName)
      const involvedAgents = new Set<string>([parentAgent])
      const createdAt = transcriptTimestamp(event)
      let completedAt: string | undefined
      let finalOutput = ''
      let modelUsed = session.model ?? ''

      for (let pointer = index + 1; pointer < nextUserIndex; pointer += 1) {
        const candidate = events[pointer]
        if (candidate.type !== 'message' || !candidate.message) continue

        if (candidate.message.role === 'assistant') {
          const text = cleanAssistantTranscriptText(extractTranscriptText(candidate.message.content))
          if (text) {
            finalOutput = text
            completedAt = transcriptTimestamp(candidate)
          }
          if (typeof candidate.message.model === 'string' && candidate.message.model.trim()) {
            modelUsed = candidate.message.model.trim()
          }
          for (const call of extractTranscriptToolCalls(candidate.message.content)) {
            const delegated = inferDelegatedAgentFromToolCall(call)
            if (delegated) involvedAgents.add(canonicalAgentName(delegated, byLowerName))
          }
        } else if (candidate.message.role === 'toolResult') {
          const delegated = inferDelegatedAgentFromToolResult(candidate.message)
          if (delegated) involvedAgents.add(canonicalAgentName(delegated, byLowerName))
        }
      }

      const status: RunStatus = completedAt ? 'completed' : 'running'
      const runId = `run-ext-${hashId(['session', session.sessionId, event.id ?? createdAt])}`
      const involvedList = [...involvedAgents]
      const delegatedOnly = involvedList.filter(name => name !== parentAgent)
      const steps: RunStep[] = [
        buildImportedStep(createdAt, 'Run imported', 'done', 'run_created', {
          title: 'Run imported',
          description: 'Imported from NemoClaw session transcript.',
          agent: parentAgent,
        }),
        buildImportedStep(createdAt, `Agent selected: ${parentAgent}`, 'done', 'agent_selected', {
          title: 'Agent selected',
          description: 'Session owner selected as primary agent.',
          agent: parentAgent,
        }),
      ]

      for (const delegatedAgent of delegatedOnly) {
        steps.push(
          buildImportedStep(completedAt ?? createdAt, `Delegated: ${delegatedAgent}`, 'done', 'skill_invoked', {
            title: 'Delegation',
            description: `Delegated work to ${delegatedAgent}.`,
            agent: delegatedAgent,
            skill: 'sessions_spawn',
          })
        )
      }

      if (status === 'completed') {
        steps.push(
          buildImportedStep(completedAt ?? createdAt, 'Run completed', 'done', 'completed', {
            title: 'Completed',
            description: 'Imported run completed.',
            agent: parentAgent,
          })
        )
      }

      importedRuns.set(runId, {
        id: runId,
        task,
        status,
        agent: parentAgent,
        agents_involved: involvedList,
        squad: findPrimarySquadId(parentAgent, squads),
        created_at: createdAt,
        completed_at: completedAt,
        duration_seconds: completedAt ? 0 : undefined,
        duration_ms: completedAt ? 0 : undefined,
        orchestrator_summary: `Imported from NemoClaw session ${session.sessionId}${modelUsed ? ` using ${modelUsed}` : ''}.`,
        final_output: finalOutput || undefined,
        steps,
        artifacts: [],
      })
    }
  }

  if (importedRuns.size === 0) return

  await Promise.all(
    [...importedRuns.values()].map(async run => {
      await saveRun(run)
    })
  )
}

async function syncNemoclawRunsFromTranscriptsBestEffort(): Promise<void> {
  const now = Date.now()
  if (nemoclawRunsSyncInFlight) {
    await nemoclawRunsSyncInFlight
    return
  }
  if (now - nemoclawRunsLastSyncedAt < NEMOCLAW_RUN_SYNC_MIN_INTERVAL_MS) return

  nemoclawRunsSyncInFlight = (async () => {
    try {
      await syncNemoclawRunsFromTranscripts()
    } catch (error) {
      console.warn('NemoClaw transcript run sync failed:', error instanceof Error ? error.message : String(error))
    } finally {
      nemoclawRunsLastSyncedAt = Date.now()
      nemoclawRunsSyncInFlight = null
    }
  })()

  await nemoclawRunsSyncInFlight
}

function buildRegistryMarkdown(agents: Agent[], squads: Squad[]): string {
  const now = nowIso()
  const memberships = new Map<string, string[]>()
  for (const squad of squads) {
    for (const member of squad.members) {
      const current = memberships.get(member) ?? []
      memberships.set(member, [...current, squad.id])
    }
  }

  const lines: string[] = []
  lines.push('# NanoSquad Registry')
  lines.push('')
  lines.push(`Generated: ${now}`)
  lines.push('Source: nanosquad-app local YAML registry')
  lines.push('')
  lines.push('Use this file as the source of truth for:')
  lines.push('- Which agents exist')
  lines.push('- Which squads each agent belongs to')
  lines.push('- Squad delegation mode, lead agent, Telegram contact agent')
  lines.push('- Squad shared lore/documentation')
  lines.push('')
  lines.push('## Agents')
  lines.push('')

  for (const agent of [...agents].sort((a, b) => a.name.localeCompare(b.name))) {
    const agentSquads = memberships.get(agent.name) ?? []
    lines.push(`### ${agent.name}`)
    lines.push(`- Role: ${agent.role || '(none)'}`)
    lines.push(`- Model: ${agent.model || '(unset)'}`)
    lines.push(`- Fallback model: ${agent.fallback_model || '(none)'}`)
    lines.push(`- Global coordinator: ${agent.global_coordinator ? 'yes' : 'no'}`)
    lines.push(`- Telegram entrypoint: ${agent.telegram_entrypoint ? 'yes' : 'no'}`)
    lines.push(`- Squads: ${agentSquads.length ? agentSquads.join(', ') : '(none)'}`)
    lines.push(`- Skills: ${agent.skills.length ? agent.skills.join(', ') : '(none)'}`)
    lines.push(`- System prompt:`)
    lines.push('```text')
    lines.push(agent.system_prompt || '')
    lines.push('```')
    lines.push('')
  }

  lines.push('## Squads')
  lines.push('')
  for (const squad of [...squads].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`### ${squad.id}`)
    lines.push(`- Name: ${squad.name}`)
    lines.push(`- Description: ${squad.description || '(none)'}`)
    lines.push(`- Delegation mode: ${squad.delegation_mode}`)
    lines.push(`- Delegation policy: ${squad.delegation_policy}`)
    lines.push(`- Lead agent: ${squad.orchestrator || '(none)'}`)
    lines.push(`- Telegram contact agent: ${squad.telegram_contact_agent || '(none)'}`)
    lines.push(`- Members: ${squad.members.length ? squad.members.join(', ') : '(none)'}`)
    lines.push('- Lore:')
    lines.push('```markdown')
    lines.push(squad.lore || '')
    lines.push('```')
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

function upsertIdentityRegistryGuidance(current: string): string {
  const guidance = [
    IDENTITY_GUIDANCE_START,
    '## Live Registry',
    `For live agent/squad membership and squad lore, read \`${NEMOCLAW_REGISTRY_FILENAME}\` before answering org-structure questions.`,
    IDENTITY_GUIDANCE_END,
  ].join('\n')

  const markerPattern = new RegExp(
    `${IDENTITY_GUIDANCE_START}[\\s\\S]*?${IDENTITY_GUIDANCE_END}`,
    'm'
  )
  if (markerPattern.test(current)) {
    return current.replace(markerPattern, guidance)
  }
  return `${current.trimEnd()}\n\n${guidance}\n`
}

async function syncNemoclawWorkspaceContext(): Promise<void> {
  const sandboxName = await resolveNemoclawSandboxName()
  const ready = await isSandboxReady(sandboxName)
  if (!ready) return

  const [agents, squads] = await Promise.all([listAgents(), listSquads()])
  const registry = buildRegistryMarkdown(agents, squads)
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanosquad-registry-'))

  try {
    const localRegistryPath = path.join(tempDir, NEMOCLAW_REGISTRY_FILENAME)
    await writeText(localRegistryPath, registry)
    await runOpenShellWithCandidates([
      'sandbox',
      'upload',
      sandboxName,
      localRegistryPath,
      `${NEMOCLAW_WORKSPACE_PATH}/${NEMOCLAW_REGISTRY_FILENAME}`,
    ])

    const localIdentityPath = path.join(tempDir, 'IDENTITY.md')
    await runOpenShellWithCandidates([
      'sandbox',
      'download',
      sandboxName,
      `${NEMOCLAW_WORKSPACE_PATH}/IDENTITY.md`,
      tempDir,
    ])
    const currentIdentity = await readText(localIdentityPath, '')
    if (currentIdentity.trim()) {
      const nextIdentity = upsertIdentityRegistryGuidance(currentIdentity)
      if (nextIdentity !== currentIdentity) {
        await writeText(localIdentityPath, nextIdentity)
        await runOpenShellWithCandidates([
          'sandbox',
          'upload',
          sandboxName,
          localIdentityPath,
          `${NEMOCLAW_WORKSPACE_PATH}/IDENTITY.md`,
        ])
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

async function syncNemoclawWorkspaceContextBestEffort(): Promise<void> {
  try {
    await syncNemoclawWorkspaceContext()
  } catch (error) {
    console.warn('NemoClaw workspace registry sync failed:', error instanceof Error ? error.message : String(error))
  }
}

async function getRun(id: string): Promise<Run | null> {
  const filePath = runFilePath(id)
  if (!(await pathExists(filePath))) return null
  const run = await readJsonFile<Run>(filePath, {} as Run)
  if (!run.id) return null
  return {
    ...run,
    steps: Array.isArray(run.steps) ? run.steps : [],
    artifacts: Array.isArray(run.artifacts) ? run.artifacts : [],
    agents_involved: Array.isArray(run.agents_involved) ? run.agents_involved : [run.agent].filter(Boolean),
    duration_ms:
      run.duration_ms ??
      (typeof run.duration_seconds === 'number' ? Math.round(run.duration_seconds * 1000) : undefined),
  }
}

async function createQueuedRun(payload: { task: string; agent?: string; project_id?: string; squad_id?: string }): Promise<Run> {
  const id = `run-${Date.now()}-${randomUUID().slice(0, 6)}`
  const run: Run = {
    id,
    task: payload.task,
    status: 'queued',
    agent: payload.agent ?? 'dispatcher',
    agents_involved: payload.agent ? [payload.agent] : [],
    squad: payload.squad_id,
    project_id: payload.project_id,
    created_at: nowIso(),
    orchestrator_summary: '',
    steps: [
      {
        label: 'Run created',
        status: 'done',
        started_at: nowIso(),
        completed_at: nowIso(),
        timestamp: nowIso(),
        type: 'run_created',
        title: 'Run created',
        description: 'Run was created and queued.',
      },
    ],
    artifacts: [],
  }
  await saveRun(run)
  return run
}

async function listArtifactsRaw(): Promise<Artifact[]> {
  const files = (await fs.readdir(PATHS.artifacts)).filter(name => name.endsWith('.json'))
  const records = await Promise.all(files.map(file => readJsonFile<Partial<Artifact>>(path.join(PATHS.artifacts, file), {})))
  const artifacts: Artifact[] = []

  for (const record of records) {
    if (!record.id || !record.path) continue
    const content = await readText(path.join(ROOT, record.path), '')
    artifacts.push({
      id: record.id,
      title: record.title ?? record.id,
      type: (record.type as ArtifactType) ?? 'text',
      run_id: record.run_id ?? '',
      project_id: record.project_id,
      agent: record.agent ?? 'unknown',
      created_at: record.created_at ?? nowIso(),
      preview: record.preview ?? content.slice(0, 160),
      path: record.path,
      content,
    })
  }

  return artifacts
}

async function listArtifacts(query?: { run_id?: string; project_id?: string; agent?: string }): Promise<Artifact[]> {
  let artifacts = await listArtifactsRaw()
  if (query?.run_id) artifacts = artifacts.filter(artifact => artifact.run_id === query.run_id)
  if (query?.project_id) artifacts = artifacts.filter(artifact => artifact.project_id === query.project_id)
  if (query?.agent) artifacts = artifacts.filter(artifact => artifact.agent === query.agent)
  return artifacts.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function getArtifact(id: string): Promise<Artifact | null> {
  const filePath = path.join(PATHS.artifacts, `${safeFileKey(id)}.json`)
  if (!(await pathExists(filePath))) return null
  const record = await readJsonFile<Partial<Artifact>>(filePath, {})
  if (!record.id || !record.path) return null
  const content = await readText(path.join(ROOT, record.path), '')
  return {
    id: record.id,
    title: record.title ?? record.id,
    type: (record.type as ArtifactType) ?? 'text',
    run_id: record.run_id ?? '',
    project_id: record.project_id,
    agent: record.agent ?? 'unknown',
    created_at: record.created_at ?? nowIso(),
    preview: record.preview ?? content.slice(0, 160),
    path: record.path,
    content,
  }
}

async function createArtifact(payload: {
  run_id: string
  project_id?: string
  agent: string
  title: string
  type: ArtifactType
  content: string
}): Promise<Artifact> {
  const id = `art-${Date.now()}-${randomUUID().slice(0, 6)}`
  const created_at = nowIso()
  const extMap: Record<ArtifactType, string> = {
    text: 'txt',
    markdown: 'md',
    json: 'json',
    code: 'txt',
    csv: 'csv',
    html: 'html',
  }

  let artifactDir: string
  let relativePath: string

  if (payload.project_id) {
    artifactDir = path.join(PATHS.projects, safeFileKey(payload.project_id), 'artifacts')
    relativePath = path.relative(ROOT, path.join(artifactDir, `${id}.${extMap[payload.type]}`))
  } else {
    artifactDir = path.join(PATHS.artifacts, 'files')
    relativePath = path.relative(ROOT, path.join(artifactDir, `${id}.${extMap[payload.type]}`))
  }

  const absoluteContentPath = path.join(ROOT, relativePath)
  await ensureDir(path.dirname(absoluteContentPath))
  await writeText(absoluteContentPath, payload.content)

  const artifact: Artifact = {
    id,
    run_id: payload.run_id,
    project_id: payload.project_id,
    agent: payload.agent,
    title: payload.title,
    type: payload.type,
    created_at,
    preview: payload.content.replace(/\s+/g, ' ').slice(0, 160),
    path: relativePath,
    content: payload.content,
  }

  await writeJsonFile(path.join(PATHS.artifacts, `${id}.json`), {
    ...artifact,
    content: undefined,
  })

  return artifact
}

async function readSettings(): Promise<Settings> {
  const base = await readJsonFile<Partial<Settings>>(SETTINGS_PATH, DEFAULT_SETTINGS)
  return {
    default_model: base.default_model ?? DEFAULT_SETTINGS.default_model,
    dispatcher_model: base.dispatcher_model ?? DEFAULT_SETTINGS.dispatcher_model,
    openrouter_api_key_set: Boolean(process.env.OPENROUTER_API_KEY),
    http_referer: base.http_referer ?? DEFAULT_SETTINGS.http_referer,
    app_title: base.app_title ?? DEFAULT_SETTINGS.app_title,
  }
}

async function writeSettings(payload: Partial<Settings> & { openrouter_api_key?: string }): Promise<Settings> {
  const current = await readSettings()
  const next: Settings = {
    default_model: payload.default_model ?? current.default_model,
    dispatcher_model: payload.dispatcher_model ?? current.dispatcher_model,
    openrouter_api_key_set: current.openrouter_api_key_set,
    http_referer: payload.http_referer ?? current.http_referer,
    app_title: payload.app_title ?? current.app_title,
  }

  await writeJsonFile(SETTINGS_PATH, next)

  if (payload.openrouter_api_key && payload.openrouter_api_key.trim()) {
    const envMap = await loadEnvLocalMap()
    envMap.set('OPENROUTER_API_KEY', payload.openrouter_api_key.trim())
    process.env.OPENROUTER_API_KEY = payload.openrouter_api_key.trim()
    await writeEnvLocalMap(envMap)
    if (isZshSyncEnabled(envMap)) {
      await syncEnvToZshrc(envMap)
    }
  }

  return readSettings()
}

async function appendAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  const line: AuditEntry = {
    id: hashId([entry.run_id, nowIso(), randomUUID().slice(0, 6)]),
    timestamp: nowIso(),
    ...entry,
  }
  await fs.appendFile(AUDIT_LOG_PATH, toJsonLine(line), 'utf8')
}

async function readAuditEntries(): Promise<AuditEntry[]> {
  const raw = await readText(AUDIT_LOG_PATH, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const entries: AuditEntry[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as AuditEntry)
    } catch {
      // ignore malformed line
    }
  }
  return entries
}

function chooseAgentForTask(task: string, agents: Agent[]): Agent {
  if (agents.length === 0) {
    throw new Error('No candidate agents available for this task.')
  }

  const lower = task.toLowerCase()
  const byName = (name: string) => agents.find(agent => agent.name === name)
  const globalCoordinator = agents.find(agent => agent.global_coordinator)

  if (/project|manager|orchestrate|orchestration|delegate|delegation|coordinate|squad/.test(lower)) {
    if (globalCoordinator) return globalCoordinator
  }

  if (/code|script|typescript|javascript|bash|shell|debug|bug|refactor/.test(lower)) {
    return byName('coder') ?? agents[0]
  }
  if (/research|latest|analyze|summary|compare|find/.test(lower)) {
    return byName('researcher') ?? agents[0]
  }
  return agents[0]
}

function chooseDelegationPattern(task: string): Squad['delegation_policy'] {
  const lower = task.toLowerCase()
  if (/compare|evaluate|best|pick|rank/.test(lower)) return 'vote'
  if (task.length > 240 || /multiple|parallel|several/.test(lower)) return 'parallel'
  return 'sequential'
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function chooseSkillForTask(task: string, availableSkills: string[]): string | undefined {
  if (availableSkills.length === 0) return undefined
  const lowerTask = task.toLowerCase()
  const normalizedSkills = new Set(availableSkills.map(skill => skill.trim().toLowerCase()))

  if (
    normalizedSkills.has('web_search') &&
    /\b(web|internet|online|browse|search|lookup|look up|latest|current|today|news|recent)\b/.test(lowerTask)
  ) {
    return availableSkills.find(skill => skill.trim().toLowerCase() === 'web_search')
  }
  if (normalizedSkills.has('code_exec') && /\b(code|script|terminal|shell|bash|python|node|debug|fix|compile|test)\b/.test(lowerTask)) {
    return availableSkills.find(skill => skill.trim().toLowerCase() === 'code_exec')
  }
  if (normalizedSkills.has('summarize') && /\b(summary|summarize|digest|brief|tl;dr)\b/.test(lowerTask)) {
    return availableSkills.find(skill => skill.trim().toLowerCase() === 'summarize')
  }

  for (const skill of availableSkills) {
    const normalizedSkill = skill.trim().toLowerCase()
    if (!normalizedSkill) continue
    const skillPattern = new RegExp(`\\b${escapeRegex(normalizedSkill).replace(/_/g, '[_\\s-]?')}\\b`, 'i')
    if (skillPattern.test(lowerTask)) return skill
  }

  return undefined
}

function step(
  label: string,
  status: RunStep['status'],
  type: NonNullable<RunStep['type']>,
  extras: Partial<RunStep> = {}
): RunStep {
  const timestamp = nowIso()
  return {
    label,
    status,
    type,
    timestamp,
    title: extras.title ?? label,
    description: extras.description,
    agent: extras.agent,
    skill: extras.skill,
    started_at: extras.started_at ?? (status !== 'pending' ? timestamp : undefined),
    completed_at: status === 'done' || status === 'error' ? timestamp : extras.completed_at,
  }
}

function extractWebSearchQuery(task: string): string {
  const firstLine = task
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) ?? task.trim()

  const cleaned = firstLine.replace(/^web[_\s-]?search[:\s-]*/i, '').trim()
  const query = cleaned || firstLine || task
  return query.slice(0, 400)
}

async function executeBraveWebSearchSkill(task: string): Promise<{ ok: boolean; output: string; message: string }> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      output: '',
      message: 'BRAVE_SEARCH_API_KEY is not set; web_search could not use Brave.',
    }
  }

  const query = extractWebSearchQuery(task)
  if (!query) {
    return {
      ok: false,
      output: '',
      message: 'Could not derive a search query for web_search.',
    }
  }

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', '5')

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        output: '',
        message: `Brave web search failed (${res.status}): ${text.slice(0, 200)}`,
      }
    }

    const payload = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
    }

    const results = Array.isArray(payload.web?.results) ? payload.web.results : []
    if (results.length === 0) {
      return {
        ok: true,
        output: `Query: ${query}\nNo web results returned by Brave.`,
        message: 'web_search executed via Brave Search API (no results).',
      }
    }

    const lines: string[] = [`Query: ${query}`, '', 'Top Brave results:']
    for (const [index, result] of results.slice(0, 5).entries()) {
      const title = result.title?.trim() || '(untitled)'
      const link = result.url?.trim() || '(no url)'
      const snippet = result.description?.trim()
      lines.push(`${index + 1}. ${title}`)
      lines.push(`   URL: ${link}`)
      if (snippet) lines.push(`   Snippet: ${snippet}`)
      lines.push('')
    }

    return {
      ok: true,
      output: lines.join('\n').trim(),
      message: 'web_search executed via Brave Search API.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      ok: false,
      output: '',
      message: `Brave web search failed: ${message}`,
    }
  }
}

async function maybeExecuteNemoclawSkill(params: {
  skillName: string
  task: string
}): Promise<{ ok: boolean; output: string; message: string }> {
  const normalizedSkill = params.skillName.trim().toLowerCase()
  if (normalizedSkill === 'web_search') {
    return executeBraveWebSearchSkill(params.task)
  }

  const cliPath = process.env.NEMOCLAW_CLI_PATH
  if (!cliPath) {
    return {
      ok: false,
      output: '',
      message: 'NEMOCLAW_CLI_PATH is not set; skill execution skipped.',
    }
  }

  const template = process.env.NEMOCLAW_SKILL_TEMPLATE ?? '{skill} --task {task}'
  const argLine = template
    .replace('{skill}', params.skillName)
    .replace('{task}', params.task.replace(/"/g, '\\"'))

  const args = argLine.split(' ').filter(Boolean)

  try {
    const { stdout, stderr } = await execFileAsync(cliPath, args, { timeout: 60_000, maxBuffer: 1024 * 1024 })
    return {
      ok: true,
      output: stdout || stderr || '',
      message: 'Skill executed through NemoClaw CLI.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      ok: false,
      output: '',
      message: `NemoClaw CLI execution failed: ${message}`,
    }
  }
}

function isLikelyLocalModel(model: string): boolean {
  const lower = model.toLowerCase()
  if (!model.includes('/')) return true
  return lower.startsWith('ollama/') || lower.startsWith('local/')
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function endpointVariants(value: string): string[] {
  const normalized = normalizeEndpoint(value)
  if (!normalized) return []

  const variants = new Set<string>([normalized])
  try {
    const parsed = new URL(normalized)
    if (parsed.hostname === 'host.openshell.internal' || parsed.hostname === 'host.docker.internal') {
      for (const host of ['localhost', '127.0.0.1']) {
        const candidate = new URL(parsed.toString())
        candidate.hostname = host
        variants.add(normalizeEndpoint(candidate.toString()))
      }
    }
  } catch {
    // Keep original value only if URL parsing fails.
  }
  return [...variants]
}

async function resolveLocalInferenceEndpoints(): Promise<string[]> {
  const candidates = new Set<string>()

  const add = (value: string | undefined): void => {
    if (!value?.trim()) return
    for (const candidate of endpointVariants(value)) {
      candidates.add(candidate)
    }
  }

  add(process.env.NEMOCLAW_ENDPOINT_URL)

  const onboard = await readJsonFile<{ endpointUrl?: string }>(ONBOARD_SESSION_PATH, {})
  if (typeof onboard.endpointUrl === 'string') {
    add(onboard.endpointUrl)
  }

  // Always include common local defaults as last-resort candidates.
  add('http://localhost:11434/v1')
  add('http://127.0.0.1:11434/v1')

  return [...candidates]
}

async function listLocalModelsFromEndpoint(): Promise<Array<{
  id: string
  provider: string
  description?: string
  context?: number
  context_window: number
  input_price: number
  output_price: number
}>> {
  const endpoints = await resolveLocalInferenceEndpoints()
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/models`)
      if (!response.ok) continue

      const data = (await response.json()) as {
        data?: Array<{ id?: string; name?: string }>
      }

      const models = (data.data ?? [])
        .map(item => item.id ?? item.name)
        .filter((id): id is string => Boolean(id))
        .map(id => ({
          id,
          provider: 'local',
          description: 'Local model',
          context: 8192,
          context_window: 8192,
          input_price: 0,
          output_price: 0,
        }))
        .sort((a, b) => a.id.localeCompare(b.id))

      if (models.length > 0) return models
    } catch {
      // Try next endpoint candidate.
    }
  }
  return []
}

async function callModel(params: {
  model: string
  systemPrompt: string
  task: string
  project?: Project | null
  squadLore?: string
}): Promise<{ output: string; model_used: string; used_fallback: boolean }> {
  const contextChunks = [params.task]
  if (params.project?.notes) contextChunks.push(`Project context:\n${params.project.notes}`)
  if (params.squadLore) contextChunks.push(`Squad lore:\n${params.squadLore}`)
  const userContent = contextChunks.join('\n\n')

  const messages = [
    { role: 'system', content: params.systemPrompt || 'You are a helpful assistant.' },
    { role: 'user', content: userContent },
  ]

  const localProvider = (process.env.NEMOCLAW_PROVIDER ?? '').toLowerCase()
  const shouldTryLocal = isLikelyLocalModel(params.model) || localProvider === 'ollama-local'
  if (shouldTryLocal) {
    const endpoints = await resolveLocalInferenceEndpoints()
    for (const endpoint of endpoints) {
      try {
        const localRes = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: params.model, messages }),
        })
        if (localRes.ok) {
          const data = (await localRes.json()) as {
            model?: string
            choices?: Array<{ message?: { content?: string } }>
          }
          const output = data.choices?.[0]?.message?.content?.trim() || 'Model returned an empty response.'
          return {
            output,
            model_used: data.model || params.model,
            used_fallback: false,
          }
        }
      } catch {
        // Try next endpoint candidate.
      }
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
    if (process.env.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model,
          messages,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          model?: string
          choices?: Array<{ message?: { content?: string } }>
        }
        const output = data.choices?.[0]?.message?.content?.trim() || 'Model returned an empty response.'
        return {
          output,
          model_used: data.model || params.model,
          used_fallback: false,
        }
      }
    } catch {
      // Fall through to fallback below.
    }
  }

  const projectContext = params.project?.notes ? `\nProject notes: ${params.project.notes}` : ''
  return {
    output: `Model call unavailable. Generated fallback response for task:\n\n${params.task}${projectContext}`,
    model_used: params.model,
    used_fallback: true,
  }
}

function initSse(res: express.Response): void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

function sendSse(res: express.Response, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

function endSse(res: express.Response): void {
  res.write('data: [DONE]\n\n')
  res.end()
}

async function listModelsFromProvider(): Promise<Array<{
  id: string
  provider: string
  description?: string
  context?: number
  context_window: number
  input_price: number
  output_price: number
}>> {
  const provider = (process.env.MODEL_PROVIDER ?? 'openrouter').toLowerCase()
  if (provider !== 'openrouter') {
    const localModels = await listLocalModelsFromEndpoint()
    return localModels.length > 0 ? localModels : MODEL_FALLBACK
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch model catalog: ${response.status}`)
    }

    const data = (await response.json()) as {
      data?: Array<{
        id?: string
        name?: string
        context_length?: number
        context_window?: number
        pricing?: { prompt?: string | number; completion?: string | number; input?: string | number; output?: string | number }
      }>
    }

    const models = (data.data ?? [])
      .map(item => {
        const id = item.id ?? item.name
        if (!id) return null
        const promptRaw = Number(item.pricing?.prompt ?? item.pricing?.input ?? 0)
        const completionRaw = Number(item.pricing?.completion ?? item.pricing?.output ?? 0)
        const input_price = promptRaw > 0 && promptRaw < 0.001 ? promptRaw * 1_000_000 : promptRaw
        const output_price = completionRaw > 0 && completionRaw < 0.001 ? completionRaw * 1_000_000 : completionRaw

        return {
          id,
          provider: inferProviderFromModelId(id),
          description: item.name ?? undefined,
          context: Number(item.context_length ?? item.context_window ?? 0) || 128000,
          context_window: Number(item.context_length ?? item.context_window ?? 0) || 128000,
          input_price,
          output_price,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.id.localeCompare(b.id))

    const localModels = await listLocalModelsFromEndpoint()
    const primary = models.length > 0 ? models : MODEL_FALLBACK
    const seen = new Set(primary.map(item => item.id))
    const merged = [...primary, ...localModels.filter(item => !seen.has(item.id))]
    return merged
  } catch {
    const localModels = await listLocalModelsFromEndpoint()
    if (localModels.length > 0) return localModels
    return MODEL_FALLBACK
  }
}

async function runTask(params: {
  task: string
  preferredAgent?: string
  project_id?: string
  preferredSquadId?: string
  task_context?: string
  stream?: (event: unknown) => Promise<void>
}): Promise<Run> {
  const startedAt = Date.now()
  const agents = await listAgents()
  if (agents.length === 0) {
    throw new Error('No agents configured. Create at least one agent first.')
  }

  const settings = await readSettings()
  const project = params.project_id ? await getProject(params.project_id) : null
  const allSquads = await listSquads()
  const requestedSquad = params.preferredSquadId
    ? allSquads.find(squad => squad.id === params.preferredSquadId)
    : undefined

  const candidatePool = requestedSquad
    ? agents.filter(agent => agent.global_coordinator || requestedSquad.members.includes(agent.name))
    : agents

  const explicitPreferredAgent = params.preferredAgent
    ? agents.find(agent => agent.name === params.preferredAgent)
    : undefined

  let routingRationale = 'Dispatcher selected the agent based on task intent and squad membership.'

  let selectedAgent = explicitPreferredAgent
  if (!selectedAgent && requestedSquad?.orchestrator) {
    const orchestrator = agents.find(agent => agent.name === requestedSquad.orchestrator)
    if (orchestrator) {
      selectedAgent = orchestrator
      routingRationale = `Squad orchestrator ${orchestrator.name} selected as primary coordinator.`
    }
  }

  if (!selectedAgent) {
    selectedAgent = chooseAgentForTask(params.task, candidatePool)
  }

  if (requestedSquad && !selectedAgent.global_coordinator && !requestedSquad.members.includes(selectedAgent.name)) {
    if (params.preferredAgent) {
      throw new Error(`Agent "${selectedAgent.name}" is not a member of squad "${requestedSquad.name}".`)
    }
    const fallbackPool = agents.filter(agent => agent.global_coordinator || requestedSquad.members.includes(agent.name))
    if (fallbackPool.length === 0) {
      throw new Error(`No agents available for squad "${requestedSquad.name}".`)
    }
    selectedAgent = chooseAgentForTask(params.task, fallbackPool)
    routingRationale = 'Fallback selection applied within squad scope.'
  }

  const selectedSquad =
    requestedSquad ??
    allSquads.find(squad => squad.members.includes(selectedAgent.name))

  const runId = `run-${Date.now()}-${randomUUID().slice(0, 6)}`
  const run: Run = {
    id: runId,
    task: params.task,
    status: 'running',
    agent: selectedAgent.name,
    agents_involved: [selectedAgent.name],
    squad: selectedSquad?.id,
    project_id: project?.id,
    created_at: nowIso(),
    orchestrator_summary: '',
    steps: [],
    artifacts: [],
  }

  run.steps.push(
    step('Run created', 'done', 'run_created', {
      title: 'Run created',
      description: 'Task execution has started.',
      agent: selectedAgent.name,
    })
  )
  run.steps.push(
    step(`Agent selected: ${selectedAgent.name}`, 'done', 'agent_selected', {
      title: 'Agent selected',
      description: routingRationale,
      agent: selectedAgent.name,
    })
  )

  let delegationDecision = selectedSquad?.delegation_policy ?? 'dynamic'
  if (selectedSquad) {
    if (selectedSquad.delegation_mode === 'dynamic') {
      delegationDecision = chooseDelegationPattern(params.task)
    } else if (selectedSquad.delegation_mode === 'strict') {
      delegationDecision = 'sequential'
    } else {
      delegationDecision = 'parallel'
    }

    run.steps.push(
      step(`Squad selected: ${selectedSquad.name}`, 'done', 'squad_selected', {
        title: 'Squad selected',
        description: `Delegation mode=${selectedSquad.delegation_mode}; runtime decision=${delegationDecision}.`,
        agent: selectedAgent.name,
      })
    )
  }

  await saveRun(run)

  if (params.stream) {
    await params.stream({
      type: 'routing',
      run_id: run.id,
      agent: selectedAgent.name,
      squad: selectedSquad?.name,
      delegation_mode: selectedSquad?.delegation_mode ?? 'dynamic',
      delegation_decision: delegationDecision,
      rationale:
        selectedAgent.global_coordinator && selectedSquad && !selectedSquad.members.includes(selectedAgent.name)
          ? 'Global coordinator selected for cross-squad orchestration.'
          : routingRationale,
    })
  }

  const effectiveTask = params.task_context ? `${params.task}\n\n${params.task_context}` : params.task
  let skillOutput = ''
  let modelTask = effectiveTask
  let modelSystemPrompt = selectedAgent.system_prompt
  const skillMatch = chooseSkillForTask(effectiveTask, selectedAgent.skills)
  if (skillMatch) {
    const isWebSearchSkill = skillMatch.trim().toLowerCase() === 'web_search'
    run.steps.push(
      step(`Skill invoked: ${skillMatch}`, 'running', 'skill_invoked', {
        title: 'Skill invoked',
        description: isWebSearchSkill
          ? `Invoking ${skillMatch} through Brave Search API.`
          : `Invoking ${skillMatch} through NemoClaw CLI.`,
        agent: selectedAgent.name,
        skill: skillMatch,
      })
    )
    const skillResult = await maybeExecuteNemoclawSkill({ skillName: skillMatch, task: effectiveTask })
    run.steps[run.steps.length - 1] = {
      ...run.steps[run.steps.length - 1],
      status: skillResult.ok ? 'done' : 'error',
      completed_at: nowIso(),
      description: skillResult.message,
    }

    if (skillResult.ok && skillResult.output.trim()) {
      skillOutput = `Skill output (${skillMatch}):\n${skillResult.output.trim()}`
      modelTask = [
        effectiveTask,
        'Tool result available from skill execution:',
        skillOutput,
        'Use the tool result above as factual context when answering.',
      ].join('\n\n')
      if (isWebSearchSkill) {
        modelSystemPrompt = [
          selectedAgent.system_prompt,
          'When web_search tool results are provided, rely on them.',
          'Do not claim you cannot access the web if tool results are present in the prompt.',
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    } else if (!skillResult.ok) {
      run.steps.push(
        step('Skill fallback applied', 'done', 'fallback', {
          title: 'Fallback',
          description: 'Skill execution failed or unavailable; continued with model-only execution.',
          agent: selectedAgent.name,
          skill: skillMatch,
        })
      )
    }
  }

  run.steps.push(
    step(`Model call: ${selectedAgent.model || settings.default_model}`, 'running', 'skill_invoked', {
      title: 'Model call started',
      description: 'Calling configured model provider.',
      agent: selectedAgent.name,
    })
  )

  const modelResult = await callModel({
    model: selectedAgent.model || settings.default_model,
    systemPrompt: modelSystemPrompt,
    task: modelTask,
    project,
    squadLore: selectedSquad?.lore,
  })

  run.steps[run.steps.length - 1] = {
    ...run.steps[run.steps.length - 1],
    status: modelResult.used_fallback ? 'error' : 'done',
    completed_at: nowIso(),
    description: modelResult.used_fallback
      ? 'Model provider call failed; fallback output generated.'
      : 'Model response received.',
  }

  const finalOutput = [modelResult.output.trim(), skillOutput].filter(Boolean).join('\n\n').trim()

  if (params.stream) {
    const chunks = finalOutput.match(/\S+\s*/g) ?? [finalOutput]
    for (const chunk of chunks) {
      await params.stream({ type: 'token', token: chunk })
      await sleep(6)
    }
  }

  if (finalOutput) {
    const artifactType = inferArtifactType(params.task, finalOutput)
    const artifact = await createArtifact({
      run_id: run.id,
      project_id: project?.id,
      agent: selectedAgent.name,
      title: `Output - ${params.task.slice(0, 80)}`,
      type: artifactType,
      content: finalOutput,
    })

    run.artifacts.push({
      id: artifact.id,
      title: artifact.title,
      type: artifact.type,
      path: artifact.path,
      preview: artifact.preview,
    })

    run.steps.push(
      step(`Artifact created: ${artifact.id}`, 'done', 'artifact_created', {
        title: 'Artifact created',
        description: `Stored output at ${artifact.path}`,
        agent: selectedAgent.name,
      })
    )
  }

  run.status = 'completed'
  run.completed_at = nowIso()
  run.duration_ms = Date.now() - startedAt
  run.duration_seconds = Math.round(run.duration_ms / 1000)
  run.orchestrator_summary = `Completed by ${selectedAgent.name}${selectedSquad ? ` within squad ${selectedSquad.name}` : ''} using ${modelResult.model_used}.`
  run.final_output = finalOutput
  run.steps.push(
    step('Run completed', 'done', 'completed', {
      title: 'Completed',
      description: 'Execution finished successfully.',
      agent: selectedAgent.name,
    })
  )

  await saveRun(run)

  await appendAudit({
    run_id: run.id,
    agent: run.agent,
    squad: run.squad,
    project_id: run.project_id,
    model_used: modelResult.model_used,
    skill: skillMatch,
    duration_ms: run.duration_ms,
    task: run.task,
    output: run.final_output ?? '',
  })

  return run
}

async function buildEnvPayload(): Promise<Array<{
  service: string
  key: string
  label: string
  description: string
  required: boolean
  is_set: boolean
  value?: string
}>> {
  const envMap = await loadEnvLocalMap()
  const payload: Array<{
    service: string
    key: string
    label: string
    description: string
    required: boolean
    is_set: boolean
    value?: string
  }> = []

  for (const [key, value] of envMap.entries()) {
    const meta = ENV_SCHEMA.find(item => item.key === key)
    payload.push({
      service: meta?.service ?? 'general',
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? 'Custom environment variable',
      required: meta?.required ?? false,
      is_set: Boolean(value),
      value: value || undefined,
    })
  }

  return payload
}

async function putEnvVar(payload: { key: string; value: string; sync_zshrc?: boolean }): Promise<{
  service: string
  key: string
  label: string
  description: string
  required: boolean
  is_set: boolean
  value?: string
}> {
  const key = payload.key.trim()
  if (!/^[A-Z0-9_]+$/.test(key)) {
    throw new Error('Environment key must be UPPER_SNAKE_CASE.')
  }

  const envMap = await loadEnvLocalMap()
  // Keep keys present in env.local even when cleared, so the UI can still
  // display them as "not set" if the line exists in the file.
  envMap.set(key, payload.value)
  process.env[key] = payload.value

  await writeEnvLocalMap(envMap)

  if (payload.sync_zshrc || isZshSyncEnabled(envMap)) {
    await syncEnvToZshrc(envMap)
  }

  const meta = ENV_SCHEMA.find(item => item.key === key)
  const value = envMap.get(key) ?? process.env[key]

  return {
    service: meta?.service ?? 'general',
    key,
    label: meta?.label ?? key,
    description: meta?.description ?? 'Custom environment variable',
    required: meta?.required ?? false,
    is_set: Boolean(value),
    value: value || undefined,
  }
}

async function testOpenRouter(): Promise<{ service: string; ok: boolean; message: string; latency_ms?: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { service: 'openrouter', ok: false, message: 'OPENROUTER_API_KEY is not set.' }
  }

  const started = Date.now()
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        service: 'openrouter',
        ok: false,
        message: `OpenRouter check failed (${res.status}): ${text.slice(0, 120)}`,
        latency_ms: Date.now() - started,
      }
    }
    return {
      service: 'openrouter',
      ok: true,
      message: 'OpenRouter connection verified.',
      latency_ms: Date.now() - started,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      service: 'openrouter',
      ok: false,
      message,
      latency_ms: Date.now() - started,
    }
  }
}

async function testTelegram(): Promise<{ service: string; ok: boolean; message: string; latency_ms?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { service: 'telegram', ok: false, message: 'TELEGRAM_BOT_TOKEN is not set.' }
  const started = Date.now()
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string } }
    if (!res.ok || !data.ok) {
      return {
        service: 'telegram',
        ok: false,
        message: 'Telegram token check failed.',
        latency_ms: Date.now() - started,
      }
    }
    return {
      service: 'telegram',
      ok: true,
      message: `Telegram bot verified${data.result?.username ? `: @${data.result.username}` : ''}.`,
      latency_ms: Date.now() - started,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      service: 'telegram',
      ok: false,
      message,
      latency_ms: Date.now() - started,
    }
  }
}

async function testBrave(): Promise<{ service: string; ok: boolean; message: string; latency_ms?: number }> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return { service: 'brave', ok: false, message: 'BRAVE_SEARCH_API_KEY is not set.' }
  const started = Date.now()
  try {
    const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=agent%20platform', {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        service: 'brave',
        ok: false,
        message: `Brave test failed (${res.status}): ${text.slice(0, 120)}`,
        latency_ms: Date.now() - started,
      }
    }
    return {
      service: 'brave',
      ok: true,
      message: 'Brave Search API verified.',
      latency_ms: Date.now() - started,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      service: 'brave',
      ok: false,
      message,
      latency_ms: Date.now() - started,
    }
  }
}

async function bootstrap(): Promise<void> {
  await ensureBaseStructure()
  await seedDefaults()
  await hydrateProcessEnvFromLocal()
  await syncNemoclawWorkspaceContextBestEffort()
  console.log(`Managed env file: ${ENV_LOCAL_PATH}`)

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', async (_req, res) => {
    res.json({
      status: 'ok',
      message: 'Backend reachable',
      timestamp: nowIso(),
      uptime_seconds: Math.round(process.uptime()),
    })
  })

  app.get('/settings', async (_req, res) => {
    res.json(await readSettings())
  })

  app.put('/settings', async (req, res) => {
    try {
      const settings = await writeSettings(req.body as Partial<Settings> & { openrouter_api_key?: string })
      res.json(settings)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save settings')
    }
  })

  app.get('/agents', async (_req, res) => {
    const squads = await listSquads()
    const agents = await listAgents()
    const runningAgents = await getRunningAgentNames()
    const alwaysOnAgents = await getAlwaysOnEntrypointAgents(agents)
    const enriched = agents.map(agent => ({
      ...agent,
      status:
        agent.status === 'running' || runningAgents.has(agent.name) || alwaysOnAgents.has(agent.name)
          ? 'running'
          : 'idle',
      squad_id: squads.find(squad => squad.members.includes(agent.name))?.id,
    }))
    res.json(enriched)
  })

  app.get('/agents/:name', async (req, res) => {
    try {
      const agent = await getAgent(req.params.name)
      if (!agent) return res.status(404).send('Agent not found')
      const runningAgents = await getRunningAgentNames()
      const alwaysOnAgents = await getAlwaysOnEntrypointAgents([agent])
      const squad = (await listSquads()).find(item => item.members.includes(agent.name))
      res.json({
        ...agent,
        status:
          agent.status === 'running' || runningAgents.has(agent.name) || alwaysOnAgents.has(agent.name)
            ? 'running'
            : 'idle',
        squad_id: squad?.id,
      })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Invalid agent name')
    }
  })

  app.put('/agents/:name', async (req, res) => {
    try {
      const agent = await putAgent(req.params.name, req.body as Partial<Agent>)
      await syncNemoclawWorkspaceContextBestEffort()
      res.json(agent)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save agent')
    }
  })

  app.delete('/agents/:name', async (req, res) => {
    try {
      await deleteAgent(req.params.name)
      await syncNemoclawWorkspaceContextBestEffort()
      res.json({ ok: true })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to delete agent')
    }
  })

  app.post('/agents/:name/run', async (req, res) => {
    const task = String(req.body?.task ?? '').trim()
    if (!task) return res.status(400).send('task is required')

    initSse(res)

    try {
      await runTask({
        task,
        preferredAgent: req.params.name,
        stream: async event => {
          sendSse(res, event)
        },
      })
      endSse(res)
    } catch (error) {
      sendSse(res, { type: 'error', message: error instanceof Error ? error.message : 'Run failed' })
      endSse(res)
    }
  })

  app.post('/ask', async (req, res) => {
    const task = String(req.body?.task ?? '').trim()
    if (!task) return res.status(400).send('task is required')

    initSse(res)

    try {
      await runTask({
        task,
        preferredAgent: typeof req.body?.agent === 'string' ? req.body.agent : undefined,
        project_id: req.body?.project_id,
        preferredSquadId: req.body?.squad_id,
        stream: async event => {
          sendSse(res, event)
        },
      })
      endSse(res)
    } catch (error) {
      sendSse(res, { type: 'error', message: error instanceof Error ? error.message : 'Ask failed' })
      endSse(res)
    }
  })

  app.get('/skills', async (_req, res) => {
    res.json(await listSkills())
  })

  app.post('/skills', async (req, res) => {
    try {
      const skill = await putSkill(req.body as Pick<Skill, 'name' | 'description' | 'code'>)
      res.json(skill)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to create skill')
    }
  })

  app.delete('/skills/:name', async (req, res) => {
    try {
      await deleteSkill(req.params.name)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to delete skill')
    }
  })

  app.get('/models', async (_req, res) => {
    res.json(await listModelsFromProvider())
  })

  app.get('/squads', async (_req, res) => {
    res.json(await listSquads())
  })

  app.get('/squads/:id', async (req, res) => {
    const squad = await getSquad(req.params.id)
    if (!squad) return res.status(404).send('Squad not found')
    res.json(squad)
  })

  app.post('/squads', async (req, res) => {
    try {
      const body = req.body as Partial<Squad>
      const name = body.name?.trim()
      if (!name) return res.status(400).send('name is required')
      const squad = await putSquad(slugify(name), {
        id: slugify(name),
        name,
        description: body.description ?? '',
        lore: body.lore ?? '',
        color: body.color ?? '#3b7ff5',
        orchestrator: body.orchestrator ?? '',
        members: Array.isArray(body.members) ? body.members : [],
        telegram_contact_agent: body.telegram_contact_agent,
        delegation_policy: body.delegation_policy ?? 'dynamic',
        delegation_mode: body.delegation_mode ?? mapPolicyToMode(body.delegation_policy ?? 'dynamic'),
        created_at: nowIso(),
      })
      await syncNemoclawWorkspaceContextBestEffort()
      res.json(squad)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to create squad')
    }
  })

  app.put('/squads/:id', async (req, res) => {
    try {
      const squad = await putSquad(req.params.id, req.body as Partial<Squad>)
      await syncNemoclawWorkspaceContextBestEffort()
      res.json(squad)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save squad')
    }
  })

  app.delete('/squads/:id', async (req, res) => {
    await deleteSquad(req.params.id)
    await syncNemoclawWorkspaceContextBestEffort()
    res.json({ ok: true })
  })

  app.get('/projects', async (_req, res) => {
    res.json(await listProjects())
  })

  app.get('/projects/:id', async (req, res) => {
    const project = await getProject(req.params.id)
    if (!project) return res.status(404).send('Project not found')
    res.json(project)
  })

  app.post('/projects', async (req, res) => {
    const body = req.body as Partial<Project>
    if (!body.name?.trim()) return res.status(400).send('name is required')
    const squadId = typeof body.squad_id === 'string' ? body.squad_id.trim() : ''
    if (!squadId) return res.status(400).send('squad_id is required')
    if (!(await getSquad(squadId))) return res.status(400).send('Invalid squad_id')
    const id = body.id?.trim() || `proj-${Date.now()}-${randomUUID().slice(0, 6)}`
    const project = await putProject(id, {
      id,
      name: body.name.trim(),
      description: body.description ?? '',
      notes: body.notes ?? '',
      squad_id: squadId,
    })
    res.json(project)
  })

  app.put('/projects/:id', async (req, res) => {
    try {
      const body = req.body as Partial<Project>
      if (typeof body.squad_id === 'string' && body.squad_id.trim()) {
        if (!(await getSquad(body.squad_id.trim()))) {
          return res.status(400).send('Invalid squad_id')
        }
      }
      const project = await putProject(req.params.id, req.body as Partial<Project>)
      res.json(project)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save project')
    }
  })

  app.delete('/projects/:id', async (req, res) => {
    await deleteProject(req.params.id)
    res.json({ ok: true })
  })

  app.get('/projects/:id/recurring-tasks', async (req, res) => {
    const project = await getProject(req.params.id)
    if (!project) return res.status(404).send('Project not found')
    res.json(await listProjectRecurringTasks(project.id))
  })

  app.post('/projects/:id/recurring-tasks', async (req, res) => {
    try {
      const project = await getProject(req.params.id)
      if (!project) return res.status(404).send('Project not found')
      const recurringTask = await createProjectRecurringTask(project.id, req.body as Partial<RecurringTask>)
      res.json(recurringTask)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to create recurring task')
    }
  })

  app.put('/projects/:id/recurring-tasks/:taskId', async (req, res) => {
    try {
      const project = await getProject(req.params.id)
      if (!project) return res.status(404).send('Project not found')
      const recurringTask = await updateProjectRecurringTask(
        project.id,
        req.params.taskId,
        req.body as Partial<RecurringTask>
      )
      res.json(recurringTask)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to update recurring task')
    }
  })

  app.delete('/projects/:id/recurring-tasks/:taskId', async (req, res) => {
    try {
      const project = await getProject(req.params.id)
      if (!project) return res.status(404).send('Project not found')
      await deleteProjectRecurringTask(project.id, req.params.taskId)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to delete recurring task')
    }
  })

  app.post('/projects/:id/recurring-tasks/:taskId/run-now', async (req, res) => {
    try {
      const project = await getProject(req.params.id)
      if (!project) return res.status(404).send('Project not found')
      const recurringTask = (await listProjectRecurringTasks(project.id)).find(task => task.id === req.params.taskId)
      if (!recurringTask) return res.status(404).send('Recurring task not found')
      await executeRecurringTask(recurringTask)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to execute recurring task')
    }
  })

  app.get('/runs', async (req, res) => {
    await syncNemoclawRunsFromTranscriptsBestEffort()
    const runs = await listRuns({
      agent: typeof req.query.agent === 'string' ? req.query.agent : undefined,
      project_id: typeof req.query.project_id === 'string' ? req.query.project_id : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as RunStatus) : undefined,
    })
    res.json(runs)
  })

  app.get('/runs/:id', async (req, res) => {
    await syncNemoclawRunsFromTranscriptsBestEffort()
    const run = await getRun(req.params.id)
    if (!run) return res.status(404).send('Run not found')
    res.json(run)
  })

  app.post('/runs', async (req, res) => {
    const task = String(req.body?.task ?? '').trim()
    if (!task) return res.status(400).send('task is required')
    const run = await createQueuedRun({
      task,
      agent: req.body?.agent,
      project_id: req.body?.project_id,
      squad_id: req.body?.squad_id,
    })
    res.json(run)
  })

  app.get('/artifacts', async (req, res) => {
    const artifacts = await listArtifacts({
      run_id: typeof req.query.run_id === 'string' ? req.query.run_id : undefined,
      project_id: typeof req.query.project_id === 'string' ? req.query.project_id : undefined,
      agent: typeof req.query.agent === 'string' ? req.query.agent : undefined,
    })
    res.json(artifacts)
  })

  app.get('/artifacts/:id', async (req, res) => {
    const artifact = await getArtifact(req.params.id)
    if (!artifact) return res.status(404).send('Artifact not found')
    res.json(artifact)
  })

  app.get('/logs', async (req, res) => {
    const entries = await readAuditEntries()
    const runSquadById = new Map((await listRunsRaw()).map(run => [run.id, run.squad]))
    const agent = typeof req.query.agent === 'string' ? req.query.agent.toLowerCase() : ''
    const skill = typeof req.query.skill === 'string' ? req.query.skill.toLowerCase() : ''
    const from = typeof req.query.from === 'string' ? new Date(req.query.from).getTime() : NaN
    const to = typeof req.query.to === 'string' ? new Date(req.query.to).getTime() : NaN

    const filtered = entries
      .filter(entry => {
        if (agent && !entry.agent.toLowerCase().includes(agent)) return false
        if (skill && !(entry.skill ?? '').toLowerCase().includes(skill)) return false
        const ts = new Date(entry.timestamp).getTime()
        if (!Number.isNaN(from) && ts < from) return false
        if (!Number.isNaN(to) && ts > to) return false
        return true
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map(entry => ({
        id: entry.id,
        timestamp: entry.timestamp,
        agent: entry.agent,
        squad: entry.squad ?? runSquadById.get(entry.run_id),
        model: entry.model_used,
        skill: entry.skill,
        task: entry.task,
        output: entry.output,
      }))

    res.json(filtered)
  })

  app.get('/logs/download', async (_req, res) => {
    if (!(await pathExists(LOGS_DOWNLOAD_PATH))) {
      return res.status(404).send('No logs available')
    }
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Content-Disposition', 'attachment; filename="audit.jsonl"')
    res.sendFile(LOGS_DOWNLOAD_PATH)
  })

  app.get('/env', async (_req, res) => {
    res.json(await buildEnvPayload())
  })

  app.put('/env', async (req, res) => {
    try {
      const key = String(req.body?.key ?? '').trim()
      const value = String(req.body?.value ?? '')
      if (!key) return res.status(400).send('key is required')
      const result = await putEnvVar({
        key,
        value,
        sync_zshrc: Boolean(req.body?.sync_zshrc),
      })
      res.json(result)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to update env var')
    }
  })

  app.post('/env/test', async (req, res) => {
    const service = String(req.body?.service ?? '').toLowerCase()

    if (service === 'openrouter') return res.json(await testOpenRouter())
    if (service === 'telegram') return res.json(await testTelegram())
    if (service === 'brave') return res.json(await testBrave())

    if (service === 'general') {
      return res.json({
        service: 'general',
        ok: true,
        message: 'General service does not require an external connectivity test.',
      })
    }

    return res.status(400).send('Unsupported service')
  })

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).send(err.message || 'Internal server error')
  })

  startRecurringTaskScheduler()

  const port = Number(process.env.BACKEND_PORT ?? 8000)
  app.listen(port, () => {
    console.log(`NemoClaw backend listening on http://localhost:${port}`)
  })
}

bootstrap().catch(error => {
  console.error('Failed to start backend:', error)
  process.exit(1)
})
