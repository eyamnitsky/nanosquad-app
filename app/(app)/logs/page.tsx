'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, ChevronDown, ChevronUp, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getLogs, getLogsDownloadUrl, type LogEntry } from '@/lib/api'
import { LogEntrySkeleton } from '@/components/skeletons'

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-foreground/60">{new Date(entry.timestamp).toLocaleString()}</span>
            <span className="font-mono font-medium text-brand">{entry.agent}</span>
            <span className="font-mono text-muted-foreground/70">{entry.model}</span>
            {entry.skill && (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono">{entry.skill}</span>
            )}
          </div>
          <p className="text-sm text-foreground truncate pr-4">{entry.task}</p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>
      {expanded && (
        <div className="px-5 pb-4">
          <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed bg-secondary/40 rounded-md p-4">
            {entry.output}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null)
  const [agentFilter, setAgentFilter] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')

  useEffect(() => {
    getLogs()
      .then(setLogs)
      .catch(() => setLogs([]))
  }, [])

  const filtered = useMemo(() => {
    if (!logs) return []
    return logs.filter(l => {
      if (agentFilter && !l.agent.toLowerCase().includes(agentFilter.toLowerCase())) return false
      if (skillFilter && !(l.skill ?? '').toLowerCase().includes(skillFilter.toLowerCase())) return false
      if (fromFilter && new Date(l.timestamp) < new Date(fromFilter)) return false
      if (toFilter && new Date(l.timestamp) > new Date(toFilter + 'T23:59:59')) return false
      return true
    })
  }, [logs, agentFilter, skillFilter, fromFilter, toFilter])

  const handleDownload = () => {
    const url = getLogsDownloadUrl()
    const a = document.createElement('a')
    a.href = url
    a.download = 'logs.jsonl'
    a.click()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {logs ? `${filtered.length} entries` : 'Loading...'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Download JSONL
        </Button>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-border bg-card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Agent</Label>
            <Input
              placeholder="Filter by agent..."
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Skill</Label>
            <Input
              placeholder="Filter by skill..."
              value={skillFilter}
              onChange={e => setSkillFilter(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={fromFilter}
              onChange={e => setFromFilter(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toFilter}
              onChange={e => setToFilter(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Log list */}
      {logs === null ? (
        <div className="rounded-lg border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <LogEntrySkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-medium text-foreground mb-1">No log entries</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {logs.length > 0
              ? 'No entries match your current filters. Try clearing the agent or skill filter.'
              : 'Run some tasks and they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map(entry => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </>
  )
}
