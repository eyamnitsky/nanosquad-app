'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import {
  Check, ChevronDown, ChevronUp, Edit2, Eye, EyeOff,
  Loader2, RefreshCw, Trash2, X, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getEnv, putEnv, clearEnv, testEnvService, type EnvVar, type EnvService, type EnvTestResult } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

const SERVICE_META: Record<EnvService, { label: string; description: string; canTest: boolean }> = {
  openrouter: {
    label: 'OpenRouter',
    description: 'AI model gateway — provides access to 200+ LLMs.',
    canTest: true,
  },
  telegram: {
    label: 'Telegram',
    description: 'Bot integration for task dispatching and notifications via Telegram.',
    canTest: true,
  },
  brave: {
    label: 'Brave Search',
    description: 'Web search skill backend — powers the web_search skill.',
    canTest: true,
  },
  general: {
    label: 'General Platform',
    description: 'Core platform settings and server configuration.',
    canTest: false,
  },
}

const SERVICE_ORDER: EnvService[] = ['openrouter', 'telegram', 'brave', 'general']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceStatus(vars: EnvVar[]): 'fully_configured' | 'partially_configured' | 'not_configured' {
  const required = vars.filter(v => v.required)
  const allSet = vars.every(v => v.is_set)
  const anySet = vars.some(v => v.is_set)
  const requiredMet = required.length === 0 || required.every(v => v.is_set)
  if (allSet || (requiredMet && vars.every(v => !v.required || v.is_set))) return 'fully_configured'
  if (anySet) return 'partially_configured'
  return 'not_configured'
}

function StatusPill({ status }: { status: ReturnType<typeof getServiceStatus> }) {
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-xs font-medium',
      status === 'fully_configured' && 'bg-status-running/15 text-status-running',
      status === 'partially_configured' && 'bg-yellow-500/15 text-yellow-500',
      status === 'not_configured' && 'bg-muted text-muted-foreground',
    )}>
      {status === 'fully_configured' && 'Fully configured'}
      {status === 'partially_configured' && 'Partially configured'}
      {status === 'not_configured' && 'Not configured'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Single variable row
// ---------------------------------------------------------------------------

interface VarRowProps {
  envVar: EnvVar
  onSave: (key: string, value: string) => Promise<void>
  onClear: (key: string) => Promise<void>
}

function VarRow({ envVar, onSave, onClear }: VarRowProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showMasked, setShowMasked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleEdit = () => {
    setEditing(true)
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSave = async () => {
    if (!inputValue.trim()) return
    setSaving(true)
    await onSave(envVar.key, inputValue.trim())
    setSaving(false)
    setEditing(false)
    setInputValue('')
  }

  const handleClear = async () => {
    setClearing(true)
    await onClear(envVar.key)
    setClearing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditing(false); setInputValue('') }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        {/* Left: label + key + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{envVar.label}</span>
            {envVar.required && (
              <span className="rounded-sm bg-destructive/10 px-1.5 py-px text-xs font-mono text-destructive">
                required
              </span>
            )}
          </div>
          <code className="mt-0.5 block font-mono text-xs text-muted-foreground">{envVar.key}</code>
          <p className="mt-1 text-xs text-muted-foreground/80 leading-relaxed">{envVar.description}</p>
        </div>

        {/* Right: value + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Value display */}
          {envVar.is_set && !editing && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-foreground/70">
                {showMasked ? envVar.masked_value : '••••••••'}
              </span>
              <button
                onClick={() => setShowMasked(s => !s)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={showMasked ? 'Hide' : 'Reveal masked value'}
              >
                {showMasked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {!envVar.is_set && !editing && (
            <span className="text-xs text-muted-foreground">Not set</span>
          )}

          {/* Edit inline input */}
          {editing && (
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                type="password"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter value..."
                className="h-7 w-48 font-mono text-xs"
                autoComplete="off"
              />
              <button
                onClick={handleSave}
                disabled={saving || !inputValue.trim()}
                className="text-status-running disabled:opacity-40 hover:opacity-80 transition-opacity"
                title="Save"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(false); setInputValue('') }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Action buttons */}
          {!editing && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleEdit}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={envVar.is_set ? 'Update value' : 'Set value'}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              {envVar.is_set && (
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  title="Clear value"
                >
                  {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Service section
// ---------------------------------------------------------------------------

interface ServiceSectionProps {
  service: EnvService
  vars: EnvVar[]
  onSave: (key: string, value: string) => Promise<void>
  onClear: (key: string) => Promise<void>
}

function ServiceSection({ service, vars, onSave, onClear }: ServiceSectionProps) {
  const meta = SERVICE_META[service]
  const status = getServiceStatus(vars)
  const [expanded, setExpanded] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<EnvTestResult | null>(null)
  const { toast } = useToast()

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testEnvService(service)
      setTestResult(result)
    } catch {
      setTestResult({
        service,
        ok: false,
        message: 'Service test failed. Check backend connectivity and required variables.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{meta.label}</span>
              <StatusPill status={status} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground text-left">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs text-muted-foreground">
            {vars.filter(v => v.is_set).length}/{vars.length} set
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-0">
          {vars.map(v => (
            <VarRow key={v.key} envVar={v} onSave={onSave} onClear={onClear} />
          ))}

          {/* Test connection */}
          {meta.canTest && (
            <div className="pt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing}
                className="gap-1.5 h-7 text-xs"
              >
                {testing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5" />}
                Test connection
              </Button>

              {testResult && (
                <span className={cn(
                  'flex items-center gap-1.5 text-xs',
                  testResult.ok ? 'text-status-running' : 'text-destructive',
                )}>
                  {testResult.ok
                    ? <Check className="h-3.5 w-3.5" />
                    : <X className="h-3.5 w-3.5" />}
                  {testResult.message}
                  {testResult.ok && testResult.latency_ms != null && (
                    <span className="text-muted-foreground ml-0.5">({testResult.latency_ms}ms)</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Reducer for optimistic local state
// ---------------------------------------------------------------------------

type EnvAction =
  | { type: 'LOADED'; vars: EnvVar[] }
  | { type: 'SET'; key: string; masked_value: string }
  | { type: 'CLEAR'; key: string }

function envReducer(state: EnvVar[], action: EnvAction): EnvVar[] {
  switch (action.type) {
    case 'LOADED': return action.vars
    case 'SET':
      return state.map(v =>
        v.key === action.key
          ? { ...v, is_set: true, masked_value: action.masked_value }
          : v
      )
    case 'CLEAR':
      return state.map(v =>
        v.key === action.key
          ? { ...v, is_set: false, masked_value: undefined }
          : v
      )
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function EnvTab() {
  const [vars, dispatch] = useReducer(envReducer, [])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    getEnv()
      .then(data => dispatch({ type: 'LOADED', vars: data }))
      .catch(() => dispatch({ type: 'LOADED', vars: [] }))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (key: string, value: string) => {
    // Optimistic: generate a masked preview locally
    const masked = value.length > 8
      ? `${value.slice(0, 4)}****${value.slice(-4)}`
      : '****'
    dispatch({ type: 'SET', key, masked_value: masked })
    try {
      const updated = await putEnv({ key, value })
      dispatch({ type: 'SET', key, masked_value: updated.masked_value ?? masked })
      toast({ title: 'Saved', description: key })
    } catch {
      toast({ title: 'Save failed', description: key, variant: 'destructive' })
    }
  }

  const handleClear = async (key: string) => {
    dispatch({ type: 'CLEAR', key })
    try {
      await clearEnv(key)
      toast({ title: 'Cleared', description: key })
    } catch {
      toast({ title: 'Clear failed', description: key, variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  const grouped = SERVICE_ORDER.map(service => ({
    service,
    vars: vars.filter(v => v.service === service),
  })).filter(g => g.vars.length > 0)

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="rounded-lg border border-border bg-secondary/50 px-4 py-3 flex items-start gap-3">
        <span className="mt-0.5 shrink-0 h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Values are stored in the NanoSquad backend&apos;s local environment and are never transmitted externally.
          Raw secret values are never returned after saving — only masked previews are shown.
          Restart the backend after changing core variables like <code className="font-mono">AGENT_PLATFORM_PORT</code>.
        </p>
      </div>

      {grouped.map(({ service, vars: sVars }) => (
        <ServiceSection
          key={service}
          service={service}
          vars={sVars}
          onSave={handleSave}
          onClear={handleClear}
        />
      ))}
    </div>
  )
}
