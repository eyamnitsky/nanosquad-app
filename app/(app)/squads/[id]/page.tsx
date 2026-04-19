'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronDown, ChevronUp, Save, Trash2, Shield, ArrowRight, ArrowDown, MessageCircle, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { getSquad, putSquad, deleteSquad, getAgents, getRuns, type Squad, type Agent, type Run } from '@/lib/api'
import { RunStatusBadge } from '@/components/run-status-badge'
import { formatDistanceToNow } from '@/lib/time'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { NewAgentDialog } from '../../agents/new-agent-dialog'

const PALETTE = [
  '#3b7ff5', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#06b6d4', '#ec4899', '#f97316',
]

const POLICIES: { value: Squad['delegation_policy']; label: string; desc: string }[] = [
  { value: 'sequential', label: 'Sequential', desc: 'Agents called one at a time in order.' },
  { value: 'parallel', label: 'Parallel', desc: 'All members run simultaneously; results merged.' },
  { value: 'vote', label: 'Vote', desc: 'Each member responds; orchestrator selects best.' },
  { value: 'dynamic', label: 'Dynamic', desc: 'Orchestrator decides the pattern at runtime based on the task.' },
]

function AgentNode({ agent, color, isOrchestrator }: { agent: Agent; color: string; isOrchestrator?: boolean }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-mono"
      style={isOrchestrator
        ? { borderColor: `${color}60`, backgroundColor: `${color}12` }
        : { borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }
      }
    >
      {isOrchestrator && <Shield className="h-3 w-3 shrink-0" style={{ color }} />}
      <span className={isOrchestrator ? 'text-foreground font-medium' : 'text-muted-foreground'}>
        {agent.name}
      </span>
      {isOrchestrator && (
        <span className="text-muted-foreground font-sans text-xs">(orchestrator)</span>
      )}
      {agent.status === 'running' && (
        <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-pulse" />
      )}
    </div>
  )
}

function DelegationDiagram({ squad, agents }: { squad: Squad; agents: Agent[] }) {
  const members = agents.filter(a => squad.members.includes(a.name) && a.name !== squad.orchestrator)
  const orchestrator = agents.find(a => a.name === squad.orchestrator)
  const policy = squad.delegation_policy
  const isDynamic = policy === 'dynamic'
  const isParallel = policy === 'parallel'
  const currentPolicy = POLICIES.find(p => p.value === policy)

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-5">
        Delegation diagram
      </h3>

      {isDynamic ? (
        /* Dynamic — show orchestrator with dashed boundary around members */
        <div className="flex flex-col items-center gap-0">
          {orchestrator && (
            <AgentNode agent={orchestrator} color={squad.color} isOrchestrator />
          )}
          {members.length > 0 && (
            <>
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="h-3 w-3 text-muted-foreground" />
              </div>
              <div
                className="rounded-lg border-2 border-dashed p-3 flex flex-col gap-2 w-full items-center"
                style={{ borderColor: `${squad.color}40` }}
              >
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full mb-1"
                  style={{ backgroundColor: `${squad.color}18`, color: squad.color }}
                >
                  decided at runtime
                </span>
                {members.map(agent => (
                  <AgentNode key={agent.name} agent={agent} color={squad.color} />
                ))}
              </div>
            </>
          )}
          {members.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground">No additional members — solo squad.</p>
          )}
        </div>
      ) : (
        /* Fixed policies — sequential chain or parallel fan */
        <div className="flex flex-col items-center gap-0">
          {orchestrator && (
            <AgentNode agent={orchestrator} color={squad.color} isOrchestrator />
          )}
          {members.length > 0 && (
            <>
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="h-3 w-3 text-muted-foreground" />
              </div>
              {isParallel ? (
                <div className="flex items-start gap-3 flex-wrap justify-center">
                  {members.map(agent => (
                    <div key={agent.name} className="flex flex-col items-center gap-0">
                      <div className="w-px h-3 bg-border" />
                      <AgentNode agent={agent} color={squad.color} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-0">
                  {members.map((agent, i) => (
                    <div key={agent.name} className="flex flex-col items-center">
                      <AgentNode agent={agent} color={squad.color} />
                      {i < members.length - 1 && (
                        <div className="flex flex-col items-center py-0.5">
                          <div className="w-px h-3 bg-border" />
                          <ArrowDown className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {members.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground">No additional members — solo squad.</p>
          )}
        </div>
      )}

      <p className="mt-5 text-xs text-muted-foreground text-center">
        <span className="font-mono text-foreground/70">{currentPolicy?.label}</span>
        {' '}— {currentPolicy?.desc}
      </p>
    </div>
  )
}

export default function SquadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [squad, setSquad] = useState<Squad | null>(null)
  const [form, setForm] = useState<Partial<Squad>>({})
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [loreExpanded, setLoreExpanded] = useState(false)
  const [newAgentOpen, setNewAgentOpen] = useState(false)

  useEffect(() => {
    setLoreExpanded(false)
    getSquad(id)
      .then(s => {
        setSquad(s)
        setForm(s)
        getRuns()
          .then(all => setRuns(all.filter(r => s.members.some(m => r.agents_involved.includes(m)))))
          .catch(() => setRuns([]))
      })
      .catch(() => {
        setSquad(null)
        setForm({})
        setRuns([])
      })
    getAgents().then(setAllAgents).catch(() => setAllAgents([]))
  }, [id])

  const set = <K extends keyof Squad>(k: K, v: Squad[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const toggleMember = (name: string) => {
    const current = form.members ?? []
    set('members',
      current.includes(name) ? current.filter(m => m !== name) : [...current, name]
    )
  }

  const handleSave = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    try {
      const payload: Partial<Squad> = {
        ...form,
        members: effectiveMembers,
        telegram_contact_agent: form.telegram_contact_agent || effectiveMembers[0],
      }
      await putSquad(id, payload)
      setSquad(prev => prev ? { ...prev, ...payload } as Squad : null)
      toast({ title: 'Squad saved' })
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteSquad(id).catch(() => null)
      toast({ title: 'Squad deleted' })
      router.push('/squads')
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    }
  }

  // Ensure orchestrator stays in members
  const effectiveMembers = [form.orchestrator, form.telegram_contact_agent, ...(form.members ?? [])]
    .filter(Boolean)
    .filter((value, index, self) => self.indexOf(value) === index) as string[]

  if (!squad) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  const memberAgents = effectiveMembers
    .map(member => allAgents.find(agent => agent.name === member))
    .filter((agent): agent is Agent => Boolean(agent))
  const squadColor = form.color ?? squad.color

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/squads" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: squadColor }}
          />
          <h1 className="text-lg font-semibold text-foreground">{squad.name}</h1>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground font-mono">
            {effectiveMembers.length} member{effectiveMembers.length !== 1 ? 's' : ''}
          </span>
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
                <AlertDialogTitle>Delete squad &ldquo;{squad.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the squad and its delegation configuration. Agents will become unassigned. This cannot be undone.
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

      {/* Agents (top) */}
      <div className="mb-8 rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Agents</h2>
            <p className="text-xs text-muted-foreground">
              Members in this squad. Add new agents directly here.
            </p>
          </div>
          <Button size="sm" onClick={() => setNewAgentOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add agent
          </Button>
        </div>

        {memberAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No members yet. Add the first agent to this squad.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {memberAgents.map(agent => (
              <Link
                key={agent.name}
                href={`/agents/${encodeURIComponent(agent.name)}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-brand/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {agent.name === form.orchestrator && (
                    <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: squadColor }} />
                  )}
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {agent.status === 'running' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-pulse" />
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: config */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-lg border border-border bg-card p-5 space-y-5">
            <h2 className="text-sm font-medium text-foreground">Configuration</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name ?? ''}
                  onChange={e => set('name', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap pt-1">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('color', c)}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform',
                        squadColor === c ? 'border-foreground scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Shared lore</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLoreExpanded(v => !v)}
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {loreExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {loreExpanded ? 'Collapse to 10 lines' : 'Expand to 50 lines'}
                </Button>
              </div>
              <Textarea
                value={form.lore ?? ''}
                onChange={e => set('lore', e.target.value)}
                rows={loreExpanded ? 50 : 10}
                className="text-sm resize-none overflow-y-auto"
                style={{
                  height: loreExpanded ? '56rem' : '14rem',
                  minHeight: loreExpanded ? '56rem' : '14rem',
                  maxHeight: loreExpanded ? '56rem' : '14rem',
                }}
                placeholder="Shared context/instructions for all squad agents..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Delegation policy</Label>
              <Select
                value={form.delegation_policy}
                onValueChange={v => set('delegation_policy', v as Squad['delegation_policy'])}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICIES.map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{p.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveMembers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Telegram main contact</Label>
                <Select
                  value={form.telegram_contact_agent || effectiveMembers[0]}
                  onValueChange={v => set('telegram_contact_agent', v)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {effectiveMembers.map(member => (
                      <SelectItem key={member} value={member} className="font-mono text-sm">
                        {member}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Members editor */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Members</h2>
            <p className="text-xs text-muted-foreground -mt-2">
              Toggle agents in or out. Click the shield to set the orchestrator.
            </p>

            {allAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allAgents.map(agent => {
                  const inSquad = effectiveMembers.includes(agent.name)
                  const isOrch = form.orchestrator === agent.name
                  return (
                    <div
                      key={agent.name}
                      className={cn(
                        'flex items-center justify-between rounded-md border px-3 py-2 transition-colors',
                        inSquad
                          ? 'border-brand/40 bg-brand-muted'
                          : 'border-border bg-secondary/40 hover:bg-secondary'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMember(agent.name)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <span className={cn(
                          'font-mono text-xs',
                          inSquad ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {agent.name}
                        </span>
                        {agent.status === 'running' && (
                          <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-pulse" />
                        )}
                      </button>
                      {inSquad && (
                        <button
                          type="button"
                          title={isOrch ? 'Orchestrator — click to unset' : 'Set as orchestrator'}
                          onClick={() => set('orchestrator', isOrch ? '' : agent.name)}
                          className={cn(
                            'ml-2 shrink-0 transition-colors',
                            isOrch ? 'text-brand' : 'text-muted-foreground/30 hover:text-muted-foreground'
                          )}
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {form.orchestrator && (
              <p className="text-xs text-muted-foreground">
                Orchestrator: <span className="font-mono text-foreground">{form.orchestrator}</span>
                {' '}· This agent receives the task first and coordinates delegation.
              </p>
            )}
          </div>
        </div>

        {/* Right: diagram */}
        <div className="space-y-4">
          <DelegationDiagram
            squad={{ ...(squad), ...form, members: effectiveMembers } as Squad}
            agents={allAgents}
          />

          {/* Quick stats */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Squad stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Members</span>
                <span className="font-mono text-foreground">{effectiveMembers.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Running</span>
                <span className="font-mono text-foreground">
                  {memberAgents.filter(a => a.status === 'running').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total runs</span>
                <span className="font-mono text-foreground">{runs?.length ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Policy</span>
                <span className="font-mono text-foreground capitalize">{form.delegation_policy}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Telegram contact
                </span>
                <span className="font-mono text-foreground">{form.telegram_contact_agent ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Recent Runs {runs ? `(${runs.length})` : ''}
        </h2>
        {runs === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No runs involving this squad yet.</p>
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
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {run.agents_involved.join(' → ')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(run.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <NewAgentDialog
        open={newAgentOpen}
        onOpenChange={setNewAgentOpen}
        squads={[{ ...(squad), ...form, members: effectiveMembers } as Squad]}
        initialSquadId={id}
        lockSquad
        onCreated={agent => {
          setAllAgents(prev => prev.some(existing => existing.name === agent.name) ? prev : [...prev, agent])
        }}
        onSquadsChanged={updatedSquads => {
          const updated = updatedSquads.find(item => item.id === id) ?? updatedSquads[0]
          if (!updated) return
          setSquad(updated)
          setForm(updated)
          getRuns()
            .then(all => setRuns(all.filter(run => updated.members.some(member => run.agents_involved.includes(member)))))
            .catch(() => setRuns([]))
        }}
      />
    </>
  )
}
