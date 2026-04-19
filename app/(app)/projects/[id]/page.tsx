'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, Play, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getProject, getRuns, getArtifacts, putProject,
  getAgents, getSquads, getSkills,
  getProjectRecurringTasks, createProjectRecurringTask, putProjectRecurringTask, deleteProjectRecurringTask, runProjectRecurringTaskNow,
  type Project, type Run, type Artifact, type Agent, type Squad, type Skill, type RecurringTask, type RecurringTaskUnit, type RecurringWeekday,
} from '@/lib/api'
import { formatDistanceToNow, formatDuration } from '@/lib/time'
import { RunStatusBadge } from '@/components/run-status-badge'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { cn } from '@/lib/utils'

const WEEKDAY_OPTIONS: Array<{ value: RecurringWeekday; label: string }> = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

function formatRunTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [tools, setTools] = useState<Skill[]>([])
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[] | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [creatingRecurring, setCreatingRecurring] = useState(false)
  const [recurringForm, setRecurringForm] = useState<{
    title: string
    task: string
    monitoring_guidance: string
    tools: string[]
    agent: string
    squad_id: string
    every_value: number
    every_unit: RecurringTaskUnit
    weekdays: RecurringWeekday[]
    run_hour: number
    run_minute: number
    start_at: string
    enabled: boolean
  }>({
    title: '',
    task: '',
    monitoring_guidance: '',
    tools: [],
    agent: '',
    squad_id: '',
    every_value: 1,
    every_unit: 'days',
    weekdays: [],
    run_hour: 9,
    run_minute: 0,
    start_at: '',
    enabled: true,
  })

  useEffect(() => {
    getProject(id)
      .then(p => { setProject(p); setNotes(p.notes ?? '') })
      .catch(() => setProject(null))
    getRuns({ project_id: id })
      .then(setRuns)
      .catch(() => setRuns([]))
    getArtifacts({ project_id: id })
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
    getProjectRecurringTasks(id)
      .then(setRecurringTasks)
      .catch(() => setRecurringTasks([]))
  }, [id])

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents([]))
    getSquads().then(setSquads).catch(() => setSquads([]))
    getSkills().then(setTools).catch(() => setTools([]))
  }, [])

  useEffect(() => {
    if (!project?.squad_id) return
    setRecurringForm(form => (form.squad_id ? form : { ...form, squad_id: project.squad_id! }))
  }, [project?.squad_id])

  const handleSaveNotes = async () => {
    if (!project) return
    setSavingNotes(true)
    await putProject(id, { notes }).catch(() => null)
    setProject(p => p ? { ...p, notes } : p)
    setSavingNotes(false)
    setEditingNotes(false)
  }

  const refreshRecurringTasks = () => {
    getProjectRecurringTasks(id).then(setRecurringTasks).catch(() => setRecurringTasks([]))
  }

  const handleCreateRecurringTask = async () => {
    if (!recurringForm.task.trim()) return
    setCreatingRecurring(true)
    await createProjectRecurringTask(id, {
      title: recurringForm.title.trim(),
      task: recurringForm.task.trim(),
      monitoring_guidance: recurringForm.monitoring_guidance.trim() || undefined,
      tools: recurringForm.tools,
      agent: recurringForm.agent || undefined,
      squad_id: recurringForm.squad_id || undefined,
      every_value: recurringForm.every_value,
      every_unit: recurringForm.every_unit,
      weekdays: recurringForm.weekdays,
      run_hour: recurringForm.run_hour,
      run_minute: recurringForm.run_minute,
      start_at: recurringForm.start_at ? new Date(recurringForm.start_at).toISOString() : undefined,
      enabled: recurringForm.enabled,
    }).catch(() => null)
    setCreatingRecurring(false)
    setRecurringForm(form => ({ ...form, title: '', task: '', monitoring_guidance: '', tools: [] }))
    refreshRecurringTasks()
  }

  const handleToggleRecurringTask = async (task: RecurringTask) => {
    await putProjectRecurringTask(id, task.id, { enabled: !task.enabled }).catch(() => null)
    refreshRecurringTasks()
  }

  const handleRunRecurringNow = async (task: RecurringTask) => {
    await runProjectRecurringTaskNow(id, task.id).catch(() => null)
    refreshRecurringTasks()
  }

  const handleDeleteRecurringTask = async (task: RecurringTask) => {
    await deleteProjectRecurringTask(id, task.id).catch(() => null)
    refreshRecurringTasks()
  }

  const toggleRecurringTool = (toolName: string) => {
    setRecurringForm(form => {
      const has = form.tools.includes(toolName)
      return {
        ...form,
        tools: has ? form.tools.filter(item => item !== toolName) : [...form.tools, toolName],
      }
    })
  }

  const toggleRecurringWeekday = (weekday: RecurringWeekday) => {
    setRecurringForm(form => {
      const selected = form.weekdays.includes(weekday)
      return {
        ...form,
        weekdays: selected
          ? form.weekdays.filter(day => day !== weekday)
          : [...form.weekdays, weekday],
      }
    })
  }

  const getRecurringScheduleLabel = (task: RecurringTask): string => {
    if (task.weekdays.length > 0) {
      const labels = WEEKDAY_OPTIONS
        .filter(option => task.weekdays.includes(option.value))
        .map(option => option.label)
        .join(', ')
      return `${labels} at ${formatRunTime(task.run_hour, task.run_minute)}`
    }
    return `every ${task.every_value} ${task.every_unit}`
  }

  if (!project) {
    return (
      <div className="space-y-4 max-w-3xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  const projectSquad = project.squad_id
    ? squads.find(squad => squad.id === project.squad_id) ?? null
    : null
  const projectSquadLabel = projectSquad?.name ?? project.squad_id ?? 'No squad'
  const projectSquadColor = projectSquad?.color ?? '#6b7280'
  const askHref = `/ask?project_id=${encodeURIComponent(project.id)}${
    project.squad_id ? `&squad_id=${encodeURIComponent(project.squad_id)}` : ''
  }`

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{project.description}</p>
          <div className="mt-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${projectSquadColor}20`, color: projectSquadColor }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: projectSquadColor }} />
              {projectSquadLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Runs', value: runs?.length ?? project.run_count },
          { label: 'Artifacts', value: artifacts?.length ?? project.artifact_count },
          { label: 'Updated', value: formatDistanceToNow(project.updated_at) },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-lg font-semibold text-foreground font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="rounded-lg border border-border bg-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Notes</h2>
          {editingNotes ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-muted-foreground"
                onClick={() => { setNotes(project.notes ?? ''); setEditingNotes(false) }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 gap-1" onClick={handleSaveNotes} disabled={savingNotes}>
                <Check className="h-3.5 w-3.5" /> {savingNotes ? 'Saving...' : 'Save'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-muted-foreground"
              onClick={() => setEditingNotes(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
        {editingNotes ? (
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            autoFocus
          />
        ) : (
          <p className={cn('text-sm leading-relaxed', notes ? 'text-foreground' : 'text-muted-foreground italic')}>
            {notes || 'No notes yet. Click Edit to add context.'}
          </p>
        )}
      </div>

      {/* Runs + Artifacts tabs */}
      <Tabs defaultValue="runs">
        <TabsList className="h-8">
          <TabsTrigger value="runs" className="text-xs">
            Runs {runs ? `(${runs.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="text-xs">
            Artifacts {artifacts ? `(${artifacts.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="recurring" className="text-xs">
            Recurring {recurringTasks ? `(${recurringTasks.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-4">
          {runs === null ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border">
              <Play className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No runs in this project yet.</p>
              <Link href={askHref}>
                <Button size="sm" variant="outline" className="mt-4 gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Dispatch a task
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {runs.map((run, i) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors',
                    i < runs.length - 1 && 'border-b border-border'
                  )}
                >
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{run.task}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{run.agent}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(run.created_at)}</p>
                    {run.duration_ms && (
                      <p className="text-xs text-muted-foreground/70">{formatDuration(run.duration_ms)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          {artifacts === null ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border">
              <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No artifacts produced in this project yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {artifacts.map((art, i) => (
                <Link
                  key={art.id}
                  href={`/artifacts/${art.id}`}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors',
                    i < artifacts.length - 1 && 'border-b border-border'
                  )}
                >
                  <ArtifactTypeBadge type={art.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{art.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{art.preview}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(art.created_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Create Recurring Task</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={recurringForm.title}
                onChange={event => setRecurringForm(form => ({ ...form, title: event.target.value }))}
                placeholder="Title (optional)"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
              <input
                type="datetime-local"
                value={recurringForm.start_at}
                onChange={event => setRecurringForm(form => ({ ...form, start_at: event.target.value }))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>

            <Textarea
              value={recurringForm.task}
              onChange={event => setRecurringForm(form => ({ ...form, task: event.target.value }))}
              rows={3}
              placeholder="Task prompt (what should this recurring run do?)"
            />

            <Textarea
              value={recurringForm.monitoring_guidance}
              onChange={event => setRecurringForm(form => ({ ...form, monitoring_guidance: event.target.value }))}
              rows={3}
              placeholder="Monitoring guidance (what to monitor continuously, escalation rules, etc.)"
            />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Select tools for this monitoring task</p>
              {tools.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No tools available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tools.map(tool => {
                    const selected = recurringForm.tools.includes(tool.name)
                    return (
                      <button
                        key={tool.name}
                        type="button"
                        onClick={() => toggleRecurringTool(tool.name)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          selected
                            ? 'border-brand/50 bg-brand-muted text-brand'
                            : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                        )}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={recurringForm.agent}
                onChange={event => setRecurringForm(form => ({ ...form, agent: event.target.value }))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">Auto agent</option>
                {agents.map(agent => (
                  <option key={agent.name} value={agent.name}>{agent.name}</option>
                ))}
              </select>

              <select
                value={recurringForm.squad_id}
                onChange={event => setRecurringForm(form => ({ ...form, squad_id: event.target.value }))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">Any squad</option>
                {squads.map(squad => (
                  <option key={squad.id} value={squad.id}>{squad.name}</option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={recurringForm.every_value}
                onChange={event => setRecurringForm(form => ({ ...form, every_value: Number(event.target.value || 1) }))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />

              <select
                value={recurringForm.every_unit}
                onChange={event => setRecurringForm(form => ({ ...form, every_unit: event.target.value as RecurringTaskUnit }))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>

            <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">
                Weekly schedule (optional): pick weekdays and hour. If no weekday is selected, interval cadence is used.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <select
                  value={recurringForm.run_hour}
                  onChange={event => setRecurringForm(form => ({ ...form, run_hour: Number(event.target.value) }))}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>
                  ))}
                </select>

                <select
                  value={recurringForm.run_minute}
                  onChange={event => setRecurringForm(form => ({ ...form, run_minute: Number(event.target.value) }))}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  {Array.from({ length: 60 }).map((_, minute) => (
                    <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(option => {
                  const selected = recurringForm.weekdays.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleRecurringWeekday(option.value)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        selected
                          ? 'border-brand/50 bg-brand-muted text-brand'
                          : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={recurringForm.enabled}
                  onChange={event => setRecurringForm(form => ({ ...form, enabled: event.target.checked }))}
                />
                Enabled
              </label>
              <Button size="sm" onClick={handleCreateRecurringTask} disabled={creatingRecurring || !recurringForm.task.trim()}>
                {creatingRecurring ? 'Creating...' : 'Add recurring task'}
              </Button>
            </div>
          </div>

          {recurringTasks === null ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}</div>
          ) : recurringTasks.length === 0 ? (
            <div className="rounded-lg border border-border bg-card py-10 text-center">
              <p className="text-sm text-muted-foreground">No recurring tasks yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {recurringTasks.map((task, index) => (
                <div
                  key={task.id}
                  className={cn(
                    'px-4 py-3 space-y-2',
                    index < recurringTasks.length - 1 && 'border-b border-border'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{task.title || task.task}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {getRecurringScheduleLabel(task)} · next {new Date(task.next_run_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={cn(
                      'text-[11px] rounded-full px-2 py-0.5',
                      task.enabled
                        ? 'bg-status-running/15 text-status-running'
                        : 'bg-secondary text-muted-foreground'
                    )}>
                      {task.enabled ? 'enabled' : 'paused'}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {task.agent && <span>agent: <span className="font-mono text-foreground">{task.agent}</span></span>}
                    {task.squad_id && <span>squad: <span className="font-mono text-foreground">{task.squad_id}</span></span>}
                    {task.tools.length > 0 && <span>tools: <span className="font-mono text-foreground">{task.tools.join(', ')}</span></span>}
                    {task.last_run_at && <span>last run: {new Date(task.last_run_at).toLocaleString()}</span>}
                    {task.last_status && <span>last status: {task.last_status}</span>}
                    {task.last_error && <span className="text-destructive">error: {task.last_error}</span>}
                  </div>

                  {task.monitoring_guidance && (
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                      guidance: {task.monitoring_guidance}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRunRecurringNow(task)}>
                      Run now
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleToggleRecurringTask(task)}>
                      {task.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => handleDeleteRecurringTask(task)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
