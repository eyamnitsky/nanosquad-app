const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

export const API_BASE = BASE

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ---- Types ----------------------------------------------------------------

export interface Agent {
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

export interface Skill {
  name: string
  description: string
  code: string
  agents: string[]
}

export interface Model {
  id: string
  provider: string
  description?: string
  context?: number
  context_window: number
  input_price: number
  output_price: number
}

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  model: string
  skill?: string
  task: string
  output: string
}

export interface Settings {
  default_model: string
  dispatcher_model: string
  openrouter_api_key_set: boolean
  http_referer: string
  app_title: string
}

// ---- Projects -------------------------------------------------------------

export interface Project {
  id: string
  name: string
  description: string
  updated_at: string
  run_count: number
  artifact_count: number
  notes?: string
}

export type RecurringTaskUnit = 'minutes' | 'hours' | 'days'
export type RecurringWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export interface RecurringTask {
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

// ---- Runs -----------------------------------------------------------------

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface RunStep {
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  started_at?: string
  completed_at?: string
}

export interface Run {
  id: string
  task: string
  status: RunStatus
  agent: string
  agents_involved: string[]
  squad?: string
  project_id?: string
  created_at: string
  completed_at?: string
  duration_ms?: number
  orchestrator_summary?: string
  steps: RunStep[]
  final_output?: string
}

// ---- Artifacts ------------------------------------------------------------

export type ArtifactType = 'text' | 'markdown' | 'json' | 'code' | 'csv' | 'html'

export interface Artifact {
  id: string
  title: string
  type: ArtifactType
  run_id: string
  project_id?: string
  agent: string
  created_at: string
  preview: string
  content: string
}

export interface HealthStatus {
  status: 'ok' | 'error'
  message?: string
}

// ---- Agents ---------------------------------------------------------------

export const getAgents = () => request<Agent[]>('/agents')
export const getAgent = (name: string) => request<Agent>(`/agents/${encodeURIComponent(name)}`)
export const putAgent = (name: string, data: Partial<Agent>) =>
  request<Agent>(`/agents/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
export const deleteAgent = (name: string) =>
  request<void>(`/agents/${encodeURIComponent(name)}`, { method: 'DELETE' })

// ---- Streaming ------------------------------------------------------------

export function streamRun(
  name: string,
  task: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): AbortController {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(`${BASE}/agents/${encodeURIComponent(name)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      if (!res.body) throw new Error('Missing response body')
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneSeen = false

      const flushEvent = (rawEvent: string) => {
        const lines = rawEvent.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          if (payload === '[DONE]') {
            doneSeen = true
            return
          }
          try {
            const parsed = JSON.parse(payload) as { type?: string; token?: string; message?: string }
            if (parsed.type === 'token' && typeof parsed.token === 'string') {
              onToken(parsed.token)
            } else if (parsed.type === 'error' && typeof parsed.message === 'string') {
              onToken(`\n\n[Error] ${parsed.message}`)
            }
          } catch {
            onToken(payload)
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const event of events) {
          flushEvent(event)
          if (doneSeen) break
        }
        if (doneSeen) break
      }
      if (buffer.trim()) flushEvent(buffer)
      onDone()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onError(err as Error)
    }
  })()
  return ctrl
}

export function streamAsk(
  task: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  options?: {
    project_id?: string
    squad_id?: string
    agent?: string
    onEvent?: (event: { type?: string; [key: string]: unknown }) => void
  }
): AbortController {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(`${BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          project_id: options?.project_id,
          squad_id: options?.squad_id,
          agent: options?.agent,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      if (!res.body) throw new Error('Missing response body')
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneSeen = false

      const flushEvent = (rawEvent: string) => {
        const lines = rawEvent.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          if (payload === '[DONE]') {
            doneSeen = true
            return
          }
          try {
            const parsed = JSON.parse(payload) as { type?: string; token?: string; message?: string; [key: string]: unknown }
            if (parsed.type === 'token' && typeof parsed.token === 'string') {
              onToken(parsed.token)
            } else if (parsed.type === 'error' && typeof parsed.message === 'string') {
              onToken(`\n\n[Error] ${parsed.message}`)
            } else {
              options?.onEvent?.(parsed)
            }
          } catch {
            onToken(payload)
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const event of events) {
          flushEvent(event)
          if (doneSeen) break
        }
        if (doneSeen) break
      }
      if (buffer.trim()) flushEvent(buffer)
      onDone()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onError(err as Error)
    }
  })()
  return ctrl
}

// ---- Ask (non-streaming meta) ---------------------------------------------

export interface AskResult {
  agent: string
  rationale: string
}

// ---- Skills ---------------------------------------------------------------

export const getSkills = () => request<Skill[]>('/skills')
export const createSkill = (data: Pick<Skill, 'name' | 'description' | 'code'>) =>
  request<Skill>('/skills', { method: 'POST', body: JSON.stringify(data) })
export const deleteSkill = (name: string) =>
  request<void>(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })

// ---- Models ---------------------------------------------------------------

export const getModels = () => request<Model[]>('/models')

// ---- Logs -----------------------------------------------------------------

export interface LogsQuery {
  agent?: string
  skill?: string
  from?: string
  to?: string
}

export const getLogs = (q: LogsQuery = {}) => {
  const params = new URLSearchParams()
  if (q.agent) params.set('agent', q.agent)
  if (q.skill) params.set('skill', q.skill)
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  const qs = params.toString()
  return request<LogEntry[]>(`/logs${qs ? `?${qs}` : ''}`)
}

export const getLogsDownloadUrl = () => `${BASE}/logs/download`

// ---- Squads ---------------------------------------------------------------

export type DelegationPolicy = 'sequential' | 'parallel' | 'vote' | 'dynamic'

export interface Squad {
  id: string
  name: string
  description: string
  lore?: string
  color: string           // hex — used for visual identity
  orchestrator: string    // agent name that leads this squad
  members: string[]       // agent names that belong to this squad
  telegram_contact_agent?: string
  delegation_policy: DelegationPolicy
  delegation_mode?: 'strict' | 'open' | 'dynamic'
  created_at: string
}

export const getSquads = () => request<Squad[]>('/squads')
export const getSquad = (id: string) => request<Squad>(`/squads/${encodeURIComponent(id)}`)
export const createSquad = (data: Omit<Squad, 'id' | 'created_at'>) =>
  request<Squad>('/squads', { method: 'POST', body: JSON.stringify(data) })
export const putSquad = (id: string, data: Partial<Squad>) =>
  request<Squad>(`/squads/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteSquad = (id: string) =>
  request<void>(`/squads/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---- Projects -------------------------------------------------------------

export const getProjects = () => request<Project[]>('/projects')
export const getProject = (id: string) => request<Project>(`/projects/${encodeURIComponent(id)}`)
export const createProject = (data: Pick<Project, 'name' | 'description' | 'notes'>) =>
  request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) })
export const putProject = (id: string, data: Partial<Project>) =>
  request<Project>(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteProject = (id: string) =>
  request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---- Project Recurring Tasks ----------------------------------------------

export const getProjectRecurringTasks = (projectId: string) =>
  request<RecurringTask[]>(`/projects/${encodeURIComponent(projectId)}/recurring-tasks`)

export const createProjectRecurringTask = (
  projectId: string,
  data: Partial<Pick<RecurringTask, 'title' | 'task' | 'monitoring_guidance' | 'tools' | 'agent' | 'squad_id' | 'every_value' | 'every_unit' | 'weekdays' | 'run_hour' | 'run_minute' | 'start_at' | 'enabled'>>
) =>
  request<RecurringTask>(`/projects/${encodeURIComponent(projectId)}/recurring-tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const putProjectRecurringTask = (
  projectId: string,
  taskId: string,
  data: Partial<RecurringTask>
) =>
  request<RecurringTask>(`/projects/${encodeURIComponent(projectId)}/recurring-tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteProjectRecurringTask = (projectId: string, taskId: string) =>
  request<void>(`/projects/${encodeURIComponent(projectId)}/recurring-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  })

export const runProjectRecurringTaskNow = (projectId: string, taskId: string) =>
  request<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/recurring-tasks/${encodeURIComponent(taskId)}/run-now`, {
    method: 'POST',
  })

// ---- Runs -----------------------------------------------------------------

export interface RunsQuery {
  agent?: string
  project_id?: string
  status?: RunStatus
}

export const getRuns = (q: RunsQuery = {}) => {
  const params = new URLSearchParams()
  if (q.agent) params.set('agent', q.agent)
  if (q.project_id) params.set('project_id', q.project_id)
  if (q.status) params.set('status', q.status)
  const qs = params.toString()
  return request<Run[]>(`/runs${qs ? `?${qs}` : ''}`)
}
export const getRun = (id: string) => request<Run>(`/runs/${encodeURIComponent(id)}`)
export const createRun = (data: { task: string; agent?: string; project_id?: string; squad_id?: string }) =>
  request<Run>('/runs', { method: 'POST', body: JSON.stringify(data) })

// ---- Artifacts ------------------------------------------------------------

export interface ArtifactsQuery {
  run_id?: string
  project_id?: string
  agent?: string
}

export const getArtifacts = (q: ArtifactsQuery = {}) => {
  const params = new URLSearchParams()
  if (q.run_id) params.set('run_id', q.run_id)
  if (q.project_id) params.set('project_id', q.project_id)
  if (q.agent) params.set('agent', q.agent)
  const qs = params.toString()
  return request<Artifact[]>(`/artifacts${qs ? `?${qs}` : ''}`)
}
export const getArtifact = (id: string) => request<Artifact>(`/artifacts/${encodeURIComponent(id)}`)

// ---- Settings -------------------------------------------------------------

export const getSettings = () => request<Settings>('/settings')
export const putSettings = (data: Partial<Settings>) =>
  request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) })
export const getHealth = () => request<HealthStatus>('/health')

// ---- Environment Variables ------------------------------------------------

export type EnvService = 'openrouter' | 'telegram' | 'brave' | 'brevo' | 'general'
export type EnvVarStatus = 'set' | 'not_set'

export interface EnvVar {
  service: EnvService
  key: string
  label: string
  description: string
  required: boolean
  is_set: boolean
  value?: string
}

export interface EnvVarUpdate {
  key: string
  value: string           // plaintext — sent once, never returned
}

export interface EnvTestResult {
  service: EnvService
  ok: boolean
  message: string
  latency_ms?: number
}

export const getEnv = () => request<EnvVar[]>('/env')
export const putEnv = (update: EnvVarUpdate) =>
  request<EnvVar>('/env', { method: 'PUT', body: JSON.stringify(update) })
export const clearEnv = (key: string) =>
  request<EnvVar>('/env', { method: 'PUT', body: JSON.stringify({ key, value: '' }) })
export const testEnvService = (service: EnvService) =>
  request<EnvTestResult>('/env/test', { method: 'POST', body: JSON.stringify({ service }) })
