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
const ENV_LOCAL_PATH = path.join(PATHS.config, 'env.local')
const AUDIT_LOG_PATH = path.join(PATHS.logs, 'audit.jsonl')
const LOGS_DOWNLOAD_PATH = path.join(PATHS.logs, 'audit.jsonl')

const ENV_BLOCK_START = '# >>> AgentPlatform env vars >>>'
const ENV_BLOCK_END = '# <<< AgentPlatform env vars <<<'

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
  created_at: string
  updated_at: string
  run_count: number
  artifact_count: number
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

function maskValue(value?: string): string | undefined {
  if (!value) return undefined
  if (value.length <= 4) return '*'.repeat(value.length)
  if (value.length <= 8) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 4)}****${value.slice(-4)}`
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

async function hydrateProcessEnvFromLocal(): Promise<void> {
  const map = await loadEnvLocalMap()
  for (const [key, value] of map.entries()) {
    if (!process.env[key]) process.env[key] = value
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
  await Promise.all(Object.values(PATHS).map(ensureDir))
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
    merged.members = [merged.telegram_contact_agent, ...merged.members]
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
  const lower = task.toLowerCase()
  const byName = (name: string) => agents.find(agent => agent.name === name)

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

async function maybeExecuteNemoclawSkill(params: {
  skillName: string
  task: string
}): Promise<{ ok: boolean; output: string; message: string }> {
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

async function callModel(params: {
  model: string
  systemPrompt: string
  task: string
  project?: Project | null
  squadLore?: string
}): Promise<{ output: string; model_used: string; used_fallback: boolean }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    const projectContext = params.project?.notes ? `\nProject notes: ${params.project.notes}` : ''
    return {
      output: `No OPENROUTER_API_KEY configured. Generated fallback response for task:\n\n${params.task}${projectContext}`,
      model_used: params.model,
      used_fallback: true,
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
  if (process.env.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE

  const contextChunks = [params.task]
  if (params.project?.notes) contextChunks.push(`Project context:\n${params.project.notes}`)
  if (params.squadLore) contextChunks.push(`Squad lore:\n${params.squadLore}`)
  const userContent = contextChunks.join('\n\n')

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter ${res.status}: ${text}`)
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return {
      output: `Model call failed; fallback response used.\n\nTask: ${params.task}\nError: ${message}`,
      model_used: params.model,
      used_fallback: true,
    }
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
    return MODEL_FALLBACK
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

    return models.length > 0 ? models : MODEL_FALLBACK
  } catch {
    return MODEL_FALLBACK
  }
}

async function runTask(params: {
  task: string
  preferredAgent?: string
  project_id?: string
  preferredSquadId?: string
  stream?: (event: unknown) => Promise<void>
}): Promise<Run> {
  const startedAt = Date.now()
  const agents = await listAgents()
  if (agents.length === 0) {
    throw new Error('No agents configured. Create at least one agent first.')
  }

  const settings = await readSettings()
  const project = params.project_id ? await getProject(params.project_id) : null
  const selectedAgent =
    (params.preferredAgent ? agents.find(agent => agent.name === params.preferredAgent) : undefined) ??
    chooseAgentForTask(params.task, agents)

  const allSquads = await listSquads()
  const selectedSquad =
    (params.preferredSquadId ? allSquads.find(squad => squad.id === params.preferredSquadId) : undefined) ??
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
      description: 'Dispatcher selected the best agent for this task.',
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
      rationale: 'Dispatcher selected the agent based on task intent and squad membership.',
    })
  }

  let skillOutput = ''
  const skillMatch = selectedAgent.skills.find(skill => params.task.toLowerCase().includes(skill.toLowerCase()))
  if (skillMatch) {
    run.steps.push(
      step(`Skill invoked: ${skillMatch}`, 'running', 'skill_invoked', {
        title: 'Skill invoked',
        description: `Invoking ${skillMatch} through NemoClaw CLI.`,
        agent: selectedAgent.name,
        skill: skillMatch,
      })
    )
    const skillResult = await maybeExecuteNemoclawSkill({ skillName: skillMatch, task: params.task })
    run.steps[run.steps.length - 1] = {
      ...run.steps[run.steps.length - 1],
      status: skillResult.ok ? 'done' : 'error',
      completed_at: nowIso(),
      description: skillResult.message,
    }

    if (skillResult.ok && skillResult.output.trim()) {
      skillOutput = `\n\nSkill output (${skillMatch}):\n${skillResult.output.trim()}`
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
    systemPrompt: selectedAgent.system_prompt,
    task: params.task,
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

  const finalOutput = `${modelResult.output}${skillOutput}`.trim()

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
  masked_value?: string
}>> {
  const envMap = await loadEnvLocalMap()
  const payload = ENV_SCHEMA.map(item => {
    const value = process.env[item.key] ?? envMap.get(item.key)
    return {
      service: item.service,
      key: item.key,
      label: item.label,
      description: item.description,
      required: item.required,
      is_set: Boolean(value),
      masked_value: value ? maskValue(value) : undefined,
    }
  })

  const known = new Set(ENV_SCHEMA.map(item => item.key))
  for (const [key, value] of envMap.entries()) {
    if (known.has(key)) continue
    payload.push({
      service: 'general',
      key,
      label: key,
      description: 'Custom environment variable',
      required: false,
      is_set: Boolean(value),
      masked_value: value ? maskValue(value) : undefined,
    })
  }

  return payload.sort((a, b) => a.service.localeCompare(b.service) || a.key.localeCompare(b.key))
}

async function putEnvVar(payload: { key: string; value: string; sync_zshrc?: boolean }): Promise<{
  service: string
  key: string
  label: string
  description: string
  required: boolean
  is_set: boolean
  masked_value?: string
}> {
  const key = payload.key.trim()
  if (!/^[A-Z0-9_]+$/.test(key)) {
    throw new Error('Environment key must be UPPER_SNAKE_CASE.')
  }

  const envMap = await loadEnvLocalMap()
  if (payload.value === '') {
    envMap.delete(key)
    delete process.env[key]
  } else {
    envMap.set(key, payload.value)
    process.env[key] = payload.value
  }

  await writeEnvLocalMap(envMap)

  if (payload.sync_zshrc || isZshSyncEnabled(envMap)) {
    await syncEnvToZshrc(envMap)
  }

  const meta = ENV_SCHEMA.find(item => item.key === key)
  const value = process.env[key] ?? envMap.get(key)

  return {
    service: meta?.service ?? 'general',
    key,
    label: meta?.label ?? key,
    description: meta?.description ?? 'Custom environment variable',
    required: meta?.required ?? false,
    is_set: Boolean(value),
    masked_value: value ? maskValue(value) : undefined,
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
    const enriched = agents.map(agent => ({
      ...agent,
      squad_id: squads.find(squad => squad.members.includes(agent.name))?.id,
    }))
    res.json(enriched)
  })

  app.get('/agents/:name', async (req, res) => {
    try {
      const agent = await getAgent(req.params.name)
      if (!agent) return res.status(404).send('Agent not found')
      const squad = (await listSquads()).find(item => item.members.includes(agent.name))
      res.json({ ...agent, squad_id: squad?.id })
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Invalid agent name')
    }
  })

  app.put('/agents/:name', async (req, res) => {
    try {
      const agent = await putAgent(req.params.name, req.body as Partial<Agent>)
      res.json(agent)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save agent')
    }
  })

  app.delete('/agents/:name', async (req, res) => {
    try {
      await deleteAgent(req.params.name)
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
      res.json(squad)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to create squad')
    }
  })

  app.put('/squads/:id', async (req, res) => {
    try {
      const squad = await putSquad(req.params.id, req.body as Partial<Squad>)
      res.json(squad)
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : 'Failed to save squad')
    }
  })

  app.delete('/squads/:id', async (req, res) => {
    await deleteSquad(req.params.id)
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
    const id = body.id?.trim() || `proj-${Date.now()}-${randomUUID().slice(0, 6)}`
    const project = await putProject(id, {
      id,
      name: body.name.trim(),
      description: body.description ?? '',
      notes: body.notes ?? '',
    })
    res.json(project)
  })

  app.put('/projects/:id', async (req, res) => {
    try {
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

  app.get('/runs', async (req, res) => {
    const runs = await listRuns({
      agent: typeof req.query.agent === 'string' ? req.query.agent : undefined,
      project_id: typeof req.query.project_id === 'string' ? req.query.project_id : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as RunStatus) : undefined,
    })
    res.json(runs)
  })

  app.get('/runs/:id', async (req, res) => {
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

  const port = Number(process.env.BACKEND_PORT ?? 8000)
  app.listen(port, () => {
    console.log(`NemoClaw backend listening on http://localhost:${port}`)
  })
}

bootstrap().catch(error => {
  console.error('Failed to start backend:', error)
  process.exit(1)
})
