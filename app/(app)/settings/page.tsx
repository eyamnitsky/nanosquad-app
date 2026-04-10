'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModelPicker } from '@/components/model-picker'
import { getSettings, putSettings, getHealth, type Settings } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { API_BASE } from '@/lib/api'
import { EnvTab } from './env-tab'

type HealthState = 'unknown' | 'checking' | 'ok' | 'error'

export default function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [form, setForm] = useState<Partial<Settings>>({})
  const [saving, setSaving] = useState(false)
  const [defaultModelOpen, setDefaultModelOpen] = useState(false)
  const [dispatchModelOpen, setDispatchModelOpen] = useState(false)
  const [health, setHealth] = useState<HealthState>('unknown')
  const [apiKeyInput, setApiKeyInput] = useState('')

  useEffect(() => {
    getSettings()
      .then(s => { setSettings(s); setForm(s) })
      .catch(() => { setSettings(null); setForm({}) })
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (apiKeyInput.trim()) {
        (payload as Record<string, unknown>).openrouter_api_key = apiKeyInput.trim()
      }
      await putSettings(payload).catch(() => null)
      toast({ title: 'Settings saved' })
      setApiKeyInput('')
    } catch {
      toast({ title: 'Failed to save settings', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setHealth('checking')
    try {
      await getHealth()
      setHealth('ok')
    } catch {
      setHealth('error')
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform configuration and integrations</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-6 h-8">
          <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
          <TabsTrigger value="environment" className="text-xs">Environment</TabsTrigger>
        </TabsList>

        {/* ---- General tab ---- */}
        <TabsContent value="general">
          {!settings ? (
            <div className="max-w-xl space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <div className="max-w-xl space-y-6">
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>

              {/* General */}
              <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-medium text-foreground">General</h2>

                <div className="space-y-1.5">
                  <Label>App title</Label>
                  <Input
                    value={form.app_title ?? ''}
                    onChange={e => set('app_title', e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>HTTP referer</Label>
                  <Input
                    value={form.http_referer ?? ''}
                    onChange={e => set('http_referer', e.target.value)}
                    className="font-mono text-sm"
                    placeholder="http://localhost:3000"
                  />
                </div>
              </section>

              {/* Models */}
              <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-medium text-foreground">Models</h2>

                <div className="space-y-1.5">
                  <Label>Default model</Label>
                  <button
                    type="button"
                    onClick={() => setDefaultModelOpen(true)}
                    className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm font-mono hover:border-brand/50 transition-colors"
                  >
                    <span className="truncate">{form.default_model ?? '—'}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label>Dispatcher model</Label>
                  <button
                    type="button"
                    onClick={() => setDispatchModelOpen(true)}
                    className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm font-mono hover:border-brand/50 transition-colors"
                  >
                    <span className="truncate">{form.dispatcher_model ?? '—'}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                </div>
              </section>

              {/* Connection test */}
              <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-medium text-foreground">Connection</h2>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={health === 'checking'}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${health === 'checking' ? 'animate-spin' : ''}`} />
                    Test Connection
                  </Button>
                  {health === 'ok' && (
                    <span className="flex items-center gap-1.5 text-sm text-status-running">
                      <CheckCircle2 className="h-4 w-4" />
                      Reachable
                    </span>
                  )}
                  {health === 'error' && (
                    <span className="flex items-center gap-1.5 text-sm text-destructive-foreground">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Unreachable at{' '}
                      <code className="font-mono text-xs">{API_BASE}</code>
                    </span>
                  )}
                </div>
              </section>
            </div>
          )}
        </TabsContent>

        {/* ---- Environment tab ---- */}
        <TabsContent value="environment">
          <div className="max-w-2xl">
            <EnvTab />
          </div>
        </TabsContent>
      </Tabs>

      <ModelPicker
        open={defaultModelOpen}
        onOpenChange={setDefaultModelOpen}
        value={form.default_model}
        onSelect={id => set('default_model', id)}
      />
      <ModelPicker
        open={dispatchModelOpen}
        onOpenChange={setDispatchModelOpen}
        value={form.dispatcher_model}
        onSelect={id => set('dispatcher_model', id)}
      />
    </>
  )
}
