'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Copy, Check, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getModels, type Model } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { TableRowSkeleton } from '@/components/skeletons'
import { cn } from '@/lib/utils'

function fmtCtx(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function fmtPrice(n: number) {
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

const PROVIDERS = ['All', 'OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral', 'DeepSeek']

export default function ModelsPage() {
  const { toast } = useToast()
  const [models, setModels] = useState<Model[] | null>(null)
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('All')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    getModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  const filtered = useMemo(() => {
    if (!models) return []
    const q = query.toLowerCase()
    return models.filter(m => {
      const matchQ = !q || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
      const matchP = provider === 'All' || m.provider === provider
      return matchQ && matchP
    })
  }, [models, query, provider])

  const handleCopy = async (id: string) => {
    await navigator.clipboard.writeText(id)
    setCopied(id)
    toast({ title: 'Model ID copied', description: id })
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {models ? `${filtered.length} of ${models.length} models` : 'Loading...'}
          </p>
        </div>
        <a
          href="https://openrouter.ai/models"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand transition-colors"
        >
          Browse on OpenRouter
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by model ID or provider..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {PROVIDERS.map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                'px-3 py-1 rounded-md text-xs transition-colors',
                provider === p
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Model ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Provider</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Context</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Input / 1M</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Output / 1M</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {models === null ? (
              Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No models match your filter. Try adjusting the search or provider.
                </td>
              </tr>
            ) : (
              filtered.map(m => (
                <tr
                  key={m.id}
                  onClick={() => handleCopy(m.id)}
                  className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/40 transition-colors group"
                  title="Click to copy model ID"
                >
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{m.id}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.provider}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono text-muted-foreground">{fmtCtx(m.context_window)}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono text-muted-foreground">{fmtPrice(m.input_price)}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono text-muted-foreground">{fmtPrice(m.output_price)}</td>
                  <td className="px-4 py-3 text-center">
                    {copied === m.id ? (
                      <Check className="h-3.5 w-3.5 text-status-running mx-auto" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 mx-auto transition-opacity" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground text-center">
        Click any row to copy the model ID to clipboard.
      </p>
    </>
  )
}
