'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Users, ArrowRight, Shield, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSquads, getAgents, type Squad, type Agent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { NewSquadDialog } from './new-squad-dialog'

const POLICY_LABELS: Record<Squad['delegation_policy'], string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
  vote: 'Vote',
  dynamic: 'Dynamic',
}

const POLICY_DESC: Record<Squad['delegation_policy'], string> = {
  sequential: 'Tasks are handed off one agent at a time down the chain.',
  parallel: 'All members receive the task simultaneously; results are merged.',
  vote: 'Each member responds independently; orchestrator picks the best answer.',
  dynamic: 'The orchestrator inspects the task at runtime and decides the delegation pattern — sequential, parallel, or solo — on the fly.',
}

function SquadCard({ squad, agents }: { squad: Squad; agents: Agent[] }) {
  const members = agents.filter(a => squad.members.includes(a.name))
  const orchestratorAgent = agents.find(a => a.name === squad.orchestrator)
  const runningCount = members.filter(a => a.status === 'running').length

  return (
    <Link
      href={`/squads/${squad.id}`}
      className="group block rounded-lg border border-border bg-card p-5 hover:border-[var(--squad-color)]/40 transition-all"
      style={{ '--squad-color': squad.color } as React.CSSProperties}
    >
      {/* Color bar */}
      <div
        className="h-0.5 w-full rounded-full mb-4 opacity-80"
        style={{ backgroundColor: squad.color }}
      />

      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-sm text-foreground group-hover:text-[var(--squad-color)] transition-colors leading-tight">
          {squad.name}
        </h2>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground font-mono">
          {POLICY_LABELS[squad.delegation_policy]}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
        {squad.description}
      </p>
      {squad.lore && (
        <p className="text-xs text-muted-foreground/90 leading-relaxed line-clamp-2 mb-3">
          {squad.lore}
        </p>
      )}

      {/* Members row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {members.map(a => (
          <span
            key={a.name}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs border',
              a.name === squad.orchestrator
                ? 'border-[var(--squad-color)]/50 bg-[var(--squad-color)]/10 text-foreground'
                : 'border-border bg-secondary text-muted-foreground'
            )}
          >
            {a.name === squad.orchestrator && (
              <Shield className="h-2.5 w-2.5" style={{ color: squad.color }} />
            )}
            {a.name}
            {a.status === 'running' && (
              <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-pulse" />
            )}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          {members.length} member{members.length !== 1 ? 's' : ''}
          {runningCount > 0 && (
            <span className="ml-2 text-status-running">{runningCount} running</span>
          )}
          {squad.telegram_contact_agent && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MessageCircle className="h-3 w-3" />
              {squad.telegram_contact_agent}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: squad.color }}>
          View <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  )
}

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[] | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    getSquads().then(setSquads).catch(() => setSquads([]))
    getAgents().then(setAgents).catch(() => setAgents([]))
  }, [])

  const unassigned = agents.filter(a => !a.squad_id || !squads?.find(s => s.id === a.squad_id))

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Squads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {squads
              ? `${squads.length} squad${squads.length !== 1 ? 's' : ''} · ${agents.length} total agents`
              : 'Loading...'}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Squad
        </Button>
      </div>

      {squads === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : squads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-medium text-foreground mb-1">No squads yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Squads are project-based agent groups. Each squad defines which agents collaborate on a project and how they delegate tasks to one another.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Squad
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {squads.map(squad => (
              <SquadCard key={squad.id} squad={squad} agents={agents} />
            ))}
          </div>

          {/* Delegation policy reference */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">Delegation Policies</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(Object.entries(POLICY_DESC) as [Squad['delegation_policy'], string][]).map(([policy, desc]) => (
                <div key={policy} className="space-y-1">
                  <span className="font-mono text-xs font-medium text-foreground">{POLICY_LABELS[policy]}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Unassigned agents */}
          {unassigned.length > 0 && (
            <div className="rounded-lg border border-dashed border-border p-5">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">Unassigned agents</h2>
              <div className="flex flex-wrap gap-2">
                {unassigned.map(a => (
                  <span
                    key={a.name}
                    className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <NewSquadDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        agents={agents}
        onCreated={squad => setSquads(prev => prev ? [...prev, squad] : [squad])}
      />
    </>
  )
}
