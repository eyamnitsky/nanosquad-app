'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Bot, Shield, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentCardSkeleton } from '@/components/skeletons'
import { getAgents, getSquads, type Agent, type Squad } from '@/lib/api'
import { cn } from '@/lib/utils'
import { NewAgentDialog } from './new-agent-dialog'

function StatusDot({ status }: { status: Agent['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'running'
          ? 'bg-status-running/15 text-status-running'
          : 'bg-muted text-muted-foreground'
      )}
    >
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'running' ? 'bg-status-running animate-pulse' : 'bg-status-idle'
      )} />
      {status}
    </span>
  )
}

function AgentCard({ agent, squad }: { agent: Agent; squad?: Squad }) {
  const isOrchestrator = squad?.orchestrator === agent.name

  return (
    <Link
      href={`/agents/${encodeURIComponent(agent.name)}`}
      className="group block rounded-lg border border-border bg-card p-5 hover:border-brand/50 transition-all"
      style={squad ? { '--squad-color': squad.color } as React.CSSProperties : {}}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {isOrchestrator && squad && (
            <Shield className="h-3 w-3 shrink-0" style={{ color: squad.color }} />
          )}
          <h2 className="font-mono text-sm font-semibold text-foreground group-hover:text-brand transition-colors truncate">
            {agent.name}
          </h2>
        </div>
        <StatusDot status={agent.status} />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
        {agent.role}
      </p>

      <p className="font-mono text-xs text-muted-foreground/70 mb-3 truncate">
        {agent.model}
      </p>

      {agent.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agent.skills.map(skill => (
            <span
              key={skill}
              className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}

function SquadSection({ squad, agents }: { squad: Squad; agents: Agent[] }) {
  const members = agents.filter(a => squad.members.includes(a.name))
  const runningCount = members.filter(a => a.status === 'running').length

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: squad.color }} />
        <Link
          href={`/squads/${squad.id}`}
          className="flex items-center gap-1.5 group"
        >
          <h2 className="text-sm font-medium text-foreground group-hover:underline">{squad.name}</h2>
          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        <span className="text-xs text-muted-foreground">
          {members.length} agent{members.length !== 1 ? 's' : ''}
          {runningCount > 0 && (
            <span className="ml-2 text-status-running">{runningCount} running</span>
          )}
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-xs font-mono text-muted-foreground"
          style={{ borderColor: `${squad.color}40` }}
        >
          {squad.delegation_policy}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(agent => (
          <AgentCard key={agent.name} agent={agent} squad={squad} />
        ))}
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [squads, setSquads] = useState<Squad[]>([])
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents([]))
    getSquads().then(setSquads).catch(() => setSquads([]))
  }, [])

  const unassigned = agents?.filter(a =>
    !squads.some(s => s.members.includes(a.name))
  ) ?? []

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agents
              ? `${agents.length} agent${agents.length !== 1 ? 's' : ''} across ${squads.length} squad${squads.length !== 1 ? 's' : ''}`
              : 'Loading...'}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      {agents === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bot className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-medium text-foreground mb-1">No agents yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Create your first agent to get started. Each agent has a role, a model, and a set of skills it can invoke.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Agent
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {squads.map(squad => {
            const members = agents.filter(a => squad.members.includes(a.name))
            if (members.length === 0) return null
            return <SquadSection key={squad.id} squad={squad} agents={agents} />
          })}

          {unassigned.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-border shrink-0" />
                <h2 className="text-sm font-medium text-muted-foreground">Unassigned</h2>
                <span className="text-xs text-muted-foreground">{unassigned.length} agent{unassigned.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unassigned.map(agent => <AgentCard key={agent.name} agent={agent} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <NewAgentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        squads={squads}
        onCreated={agent => setAgents(prev => prev ? [...prev, agent] : [agent])}
        onSquadsChanged={setSquads}
      />
    </>
  )
}
