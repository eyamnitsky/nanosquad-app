'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Send, Square, ChevronDown, ChevronUp, FolderOpen, ArrowRight, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { streamAsk, getProjects, getSquads, createRun, type Project, type Squad } from '@/lib/api'
import { RunStatusBadge } from '@/components/run-status-badge'
import { cn } from '@/lib/utils'

interface DispatchedTask {
  id: string
  task: string
  agent: string
  rationale: string
  output: string
  timestamp: string
  runId?: string
  projectId?: string
}

function HistoryEntry({ entry, projectName }: { entry: DispatchedTask; projectName?: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-4 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{entry.task}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="font-mono text-brand">{entry.agent}</span>
            {projectName && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {projectName}
                </span>
              </>
            )}
            <span>·</span>
            <span>{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Rationale</p>
            <p className="text-sm text-foreground leading-relaxed">{entry.rationale}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
            <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed bg-secondary/50 rounded-md p-3">
              {entry.output}
            </pre>
          </div>
          {entry.runId && (
            <Link
              href={`/runs/${entry.runId}`}
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
            >
              View run <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default function AskPage() {
  const [task, setTask] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const [streamDone, setStreamDone] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [rationale, setRationale] = useState<string | null>(null)
  const [history, setHistory] = useState<DispatchedTask[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null)
  const [runId, setRunId] = useState<string | null>(null)

  const ctrlRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const outputTextRef = useRef('')
  const runIdRef = useRef<string | null>(null)
  const selectedAgentRef = useRef<string | null>(null)
  const rationaleRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      getProjects().catch(() => [] as Project[]),
      getSquads().catch(() => [] as Squad[]),
    ]).then(([loadedProjects, loadedSquads]) => {
      if (cancelled) return
      setProjects(loadedProjects)
      setSquads(loadedSquads)

      const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const preselectedProjectId = search?.get('project_id')
      if (preselectedProjectId) {
        const match = loadedProjects.find(project => project.id === preselectedProjectId)
        if (match) setSelectedProject(match)
      }

      const preselectedSquadId = search?.get('squad_id')
      if (preselectedSquadId) {
        const match = loadedSquads.find(squad => squad.id === preselectedSquadId)
        if (match) setSelectedSquad(match)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async () => {
    if (!task.trim() || streaming) return
    const currentTask = task.trim()
    setTask('')
    setOutput('')
    outputTextRef.current = ''
    setStreamDone(false)
    setStreaming(true)
    setSelectedAgent(null)
    setRationale(null)
    setRunId(null)
    runIdRef.current = null
    selectedAgentRef.current = null
    rationaleRef.current = null

    createRun({
      task: currentTask,
      project_id: selectedProject?.id,
      squad_id: selectedSquad?.id,
    }).then(run => {
      setRunId(run.id)
      runIdRef.current = run.id
    }).catch(() => null)

    ctrlRef.current = streamAsk(
      currentTask,
      token => {
        outputTextRef.current += token
        setOutput(prev => prev + token)
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
      },
      () => {
        setStreaming(false)
        setStreamDone(true)
        setHistory(prev => [{
          id: Date.now().toString(),
          task: currentTask,
          agent: selectedAgentRef.current ?? 'dispatcher',
          rationale: rationaleRef.current ?? 'Routed by dispatcher.',
          output: outputTextRef.current,
          timestamp: new Date().toISOString(),
          runId: runIdRef.current ?? undefined,
          projectId: selectedProject?.id,
        }, ...prev])
      },
      () => {
        setStreaming(false)
        const errorText = '\n\n[Stream error] Backend request failed.'
        outputTextRef.current += errorText
        setOutput(prev => prev + errorText)
        setStreamDone(true)
      },
      {
        project_id: selectedProject?.id,
        squad_id: selectedSquad?.id,
        onEvent: event => {
          if (event.type === 'routing') {
            const agentName = typeof event.agent === 'string' ? event.agent : 'dispatcher'
            const delegationMode = typeof event.delegation_mode === 'string' ? event.delegation_mode : 'dynamic'
            const delegationDecision = typeof event.delegation_decision === 'string' ? event.delegation_decision : 'dynamic'
            const nextRationale = `Delegation mode: ${delegationMode}. Runtime decision: ${delegationDecision}.`
            setSelectedAgent(agentName)
            setRationale(nextRationale)
            selectedAgentRef.current = agentName
            rationaleRef.current = nextRationale
            if (typeof event.run_id === 'string') {
              setRunId(event.run_id)
              runIdRef.current = event.run_id
            }
          }
        },
      }
    )
  }

  const handleStop = () => {
    ctrlRef.current?.abort()
    setStreaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-xl font-semibold text-foreground mb-2">Ask</h1>
        <p className="text-sm text-muted-foreground">
          The dispatcher routes your task to the best available agent.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Textarea
          placeholder="Describe what you need..."
          value={task}
          onChange={e => setTask(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          className="text-sm resize-none border-0 bg-transparent focus-visible:ring-0 p-0 shadow-none"
          disabled={streaming}
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors border',
                    selectedProject
                      ? 'border-brand/40 bg-brand-muted text-brand'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {selectedProject ? selectedProject.name : 'No project'}
                  <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setSelectedProject(null)} className="text-xs">
                  No project
                </DropdownMenuItem>
                {projects.length > 0 && <DropdownMenuSeparator />}
                {projects.map(p => (
                  <DropdownMenuItem key={p.id} onClick={() => setSelectedProject(p)} className="text-xs">
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors border',
                    selectedSquad
                      ? 'border-[var(--sq-color)]/50 text-foreground'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                  style={selectedSquad ? {
                    '--sq-color': selectedSquad.color,
                    backgroundColor: `${selectedSquad.color}18`,
                  } as React.CSSProperties : {}}
                >
                  <Users className="h-3.5 w-3.5" style={selectedSquad ? { color: selectedSquad.color } : {}} />
                  {selectedSquad ? selectedSquad.name : 'Any squad'}
                  <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Route task to squad
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedSquad(null)} className="text-xs">
                  Any squad (auto-dispatch)
                </DropdownMenuItem>
                {squads.map(s => (
                  <DropdownMenuItem key={s.id} onClick={() => setSelectedSquad(s)} className="text-xs flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span>{s.name}</span>
                    <span className="ml-auto font-mono text-muted-foreground">{s.delegation_policy}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {streaming ? 'Running...' : task.trim() ? '⌘ Enter' : ''}
            </span>
            {streaming ? (
              <Button size="sm" variant="outline" onClick={handleStop} className="gap-1.5">
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={!task.trim()} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Dispatch
              </Button>
            )}
          </div>
        </div>
      </div>

      {(selectedAgent || streaming || output) && (
        <div className="mt-6 space-y-3">
          {selectedAgent && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {selectedSquad && (
                <>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${selectedSquad.color}18`, color: selectedSquad.color }}
                  >
                    <Users className="h-3 w-3" />
                    {selectedSquad.name}
                  </span>
                  <span className="text-muted-foreground">·</span>
                </>
              )}
              <span className="text-muted-foreground">Routed to</span>
              <span className="font-mono text-brand font-medium">{selectedAgent}</span>
              {runId && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <RunStatusBadge status={streaming ? 'running' : streamDone ? 'completed' : 'queued'} />
                  {streamDone && (
                    <Link href={`/runs/${runId}`} className="flex items-center gap-1 text-xs text-brand hover:underline ml-1">
                      View run <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </>
              )}
            </div>
          )}

          {rationale && <p className="text-xs text-muted-foreground">{rationale}</p>}

          {(output || streaming) && (
            <div
              ref={outputRef}
              className={cn(
                'rounded-lg border border-border bg-secondary/30 p-4 overflow-auto max-h-80',
                streaming && !streamDone && 'cursor-blink'
              )}
            >
              <pre className="font-mono text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {output}
              </pre>
              {streamDone && (
                <span className="inline-flex items-center gap-1 mt-3 rounded-full bg-status-running/15 px-2 py-0.5 text-xs text-status-running">
                  Done
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-10 space-y-3">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Tasks</h2>
          {history.map(entry => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              projectName={projects.find(p => p.id === entry.projectId)?.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
