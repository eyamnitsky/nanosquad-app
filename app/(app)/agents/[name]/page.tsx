'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronDown, Save, Play, Square, Trash2, X, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModelPicker } from '@/components/model-picker'
import { AgentCardSkeleton } from '@/components/skeletons'
import {
  getAgent, putAgent, deleteAgent, getAgent as fetchAgent, streamRun, getLogs,
  getRuns, getArtifacts,
  type Agent, type LogEntry, type Run, type Artifact,
} from '@/lib/api'
import { RunStatusBadge } from '@/components/run-status-badge'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { formatDistanceToNow, formatDuration } from '@/lib/time'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

function StatusBadge({ status }: { status: Agent['status'] }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
      status === 'running' ? 'bg-status-running/15 text-status-running' : 'bg-muted text-muted-foreground'
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'running' ? 'bg-status-running animate-pulse' : 'bg-status-idle')} />
      {status}
    </span>
  )
}

function SkillTagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map(s => (
          <span key={s} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
            {s}
            <button type="button" onClick={() => onChange(value.filter(x => x !== s))} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add skill..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="h-7 text-xs font-mono"
        />
        <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  const { name } = useParams<{ name: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [form, setForm] = useState<Partial<Agent>>({})
  const [saving, setSaving] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [fallbackPickerOpen, setFallbackPickerOpen] = useState(false)

  // Run task state
  const [task, setTask] = useState('')
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamDone, setStreamDone] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Logs / Runs / Artifacts
  const [logs, setLogs] = useState<LogEntry[] | null>(null)
  const [agentRuns, setAgentRuns] = useState<Run[] | null>(null)
  const [agentArtifacts, setAgentArtifacts] = useState<Artifact[] | null>(null)

  const decodedName = decodeURIComponent(name)

  useEffect(() => {
    fetchAgent(decodedName)
      .then(a => { setAgent(a); setForm(a) })
      .catch(() => {
        setAgent(null)
        setForm({})
      })
    getLogs({ agent: decodedName })
      .then(setLogs)
      .catch(() => setLogs([]))
    getRuns({ agent: decodedName })
      .then(setAgentRuns)
      .catch(() => setAgentRuns([]))
    getArtifacts({ agent: decodedName })
      .then(setAgentArtifacts)
      .catch(() => setAgentArtifacts([]))
  }, [decodedName])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const set = <K extends keyof Agent>(k: K, v: Agent[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await putAgent(decodedName, form)
      toast({ title: 'Agent saved' })
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteAgent(decodedName).catch(() => null)
      toast({ title: 'Agent deleted' })
      router.push('/agents')
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    }
  }

  const handleRun = () => {
    if (!task.trim()) return
    setOutput('')
    setStreamDone(false)
    setStreaming(true)
    ctrlRef.current = streamRun(
      decodedName,
      task,
      token => setOutput(prev => prev + token),
      () => { setStreaming(false); setStreamDone(true) },
      () => { setStreaming(false); setOutput(prev => prev + '\n\n[Stream error]') }
    )
  }

  const handleStop = () => {
    ctrlRef.current?.abort()
    setStreaming(false)
  }

  if (!agent) {
    return (
      <div className="max-w-2xl space-y-4">
        <AgentCardSkeleton />
        <AgentCardSkeleton />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-mono text-lg font-semibold text-foreground">{agent.name}</h1>
          <StatusBadge status={agent.status} />
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive-foreground gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete agent &ldquo;{agent.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the agent and its configuration. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Config column */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-lg border border-border bg-card p-5 space-y-5">
            <h2 className="text-sm font-medium text-foreground">Configuration</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name ?? ''}
                  onChange={e => set('name', e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex h-9 items-center">
                  <StatusBadge status={agent.status} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role description</Label>
              <Textarea
                value={form.role ?? ''}
                onChange={e => set('role', e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Global coordinator</p>
                  <p className="text-xs text-muted-foreground">Can orchestrate work across any squad when explicitly targeted.</p>
                </div>
                <Switch
                  checked={Boolean(form.global_coordinator)}
                  onCheckedChange={checked => set('global_coordinator', Boolean(checked))}
                />
              </div>

              <div className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Telegram entrypoint</p>
                  <p className="text-xs text-muted-foreground">Primary agent intended to receive Telegram-routed tasks.</p>
                </div>
                <Switch
                  checked={Boolean(form.telegram_entrypoint)}
                  onCheckedChange={checked => set('telegram_entrypoint', Boolean(checked))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>System prompt</Label>
              <Textarea
                value={form.system_prompt ?? ''}
                onChange={e => set('system_prompt', e.target.value)}
                rows={6}
                className="font-mono text-xs resize-y"
                placeholder="You are a helpful assistant..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Skills</Label>
              <SkillTagInput
                value={form.skills ?? []}
                onChange={v => set('skills', v)}
              />
            </div>
          </div>

          {/* Model & params */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Model & Parameters</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <button
                  type="button"
                  onClick={() => setModelPickerOpen(true)}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm font-mono hover:border-brand/50 transition-colors"
                >
                  <span className="truncate">{form.model ?? '—'}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label>Fallback model</Label>
                <button
                  type="button"
                  onClick={() => setFallbackPickerOpen(true)}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm font-mono hover:border-brand/50 transition-colors"
                >
                  <span className="truncate text-muted-foreground">{form.fallback_model ?? 'None'}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Max tokens</Label>
                <Input
                  type="number"
                  value={form.max_tokens ?? ''}
                  onChange={e => set('max_tokens', parseInt(e.target.value) || undefined as unknown as number)}
                  className="font-mono text-sm"
                  placeholder="4096"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Temperature</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={form.temperature ?? ''}
                  onChange={e => set('temperature', parseFloat(e.target.value) || undefined as unknown as number)}
                  className="font-mono text-sm"
                  placeholder="0.7"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Run task panel */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Run Task</h2>
            <Textarea
              placeholder="Describe a task for this agent..."
              value={task}
              onChange={e => setTask(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
            <div className="flex gap-2">
              {streaming ? (
                <Button size="sm" variant="outline" onClick={handleStop} className="gap-1.5 flex-1">
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={handleRun} disabled={!task.trim()} className="gap-1.5 flex-1">
                  <Play className="h-3.5 w-3.5" />
                  Run
                </Button>
              )}
            </div>

            {(output || streaming) && (
              <div
                ref={outputRef}
                className={cn(
                  'mt-2 rounded-md border border-border bg-secondary/50 p-3 overflow-auto max-h-64',
                  streaming && 'cursor-blink'
                )}
              >
                <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {output}
                </pre>
                {streamDone && (
                  <span className="inline-flex items-center gap-1 mt-2 rounded-full bg-status-running/15 px-2 py-0.5 text-xs text-status-running">
                    Done
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom tabs */}
      <div className="mt-8">
        <Tabs defaultValue="runs">
          <TabsList className="h-8">
            <TabsTrigger value="runs" className="text-xs">
              Runs {agentRuns ? `(${agentRuns.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="artifacts" className="text-xs">
              Artifacts {agentArtifacts ? `(${agentArtifacts.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
            <TabsTrigger value="memory" className="text-xs">Memory</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="mt-4">
            {agentRuns === null ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
            ) : agentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No runs for this agent yet.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                {agentRuns.map((run, i) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className={cn('flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors', i < agentRuns.length - 1 && 'border-b border-border')}
                  >
                    <RunStatusBadge status={run.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{run.task}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(run.created_at)}</p>
                      {run.duration_ms != null && (
                        <p className="text-xs text-muted-foreground/60 font-mono">{formatDuration(run.duration_ms)}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="mt-4">
            {agentArtifacts === null ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
            ) : agentArtifacts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No artifacts produced by this agent yet.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                {agentArtifacts.map((art, i) => (
                  <Link
                    key={art.id}
                    href={`/artifacts/${art.id}`}
                    className={cn('flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors', i < agentArtifacts.length - 1 && 'border-b border-border')}
                  >
                    <ArtifactTypeBadge type={art.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{art.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{art.preview}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(art.created_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            {logs === null ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logs yet for this agent.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                {logs.map(log => (
                  <div key={log.id} className="border-b border-border last:border-0 px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                      <span className="font-mono text-foreground/70">{log.model}</span>
                      {log.skill && (
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono">{log.skill}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground truncate">{log.task}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="memory" className="mt-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                No persistent context summary available for this agent. Memory will appear here once the agent has run tasks that produce persistent context.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ModelPicker
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        value={form.model}
        onSelect={id => set('model', id)}
      />
      <ModelPicker
        open={fallbackPickerOpen}
        onOpenChange={setFallbackPickerOpen}
        value={form.fallback_model}
        onSelect={id => set('fallback_model', id)}
      />
    </>
  )
}
