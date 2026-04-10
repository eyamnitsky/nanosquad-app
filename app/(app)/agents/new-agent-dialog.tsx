'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ModelPicker } from '@/components/model-picker'
import { createSquad, putAgent, putSquad, type Agent, type Squad } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { ChevronDown } from 'lucide-react'

const NEW_SQUAD_ID = '__new__'

interface NewAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  squads: Squad[]
  onCreated: (agent: Agent) => void
  onSquadsChanged: (squads: Squad[]) => void
}

export function NewAgentDialog({ open, onOpenChange, squads, onCreated, onSquadsChanged }: NewAgentDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    role: '',
    model: 'openai/gpt-4o-mini',
  })
  const [selectedSquadId, setSelectedSquadId] = useState('')
  const [newSquad, setNewSquad] = useState({
    name: '',
    description: '',
    lore: '',
    color: '#3b7ff5',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setSelectedSquadId(squads.length > 0 ? squads[0].id : NEW_SQUAD_ID)
  }, [open, squads])

  const existingSquad = useMemo(
    () => squads.find(s => s.id === selectedSquadId),
    [squads, selectedSquadId]
  )

  const set = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const setNewSquadField = (k: keyof typeof newSquad, v: string) =>
    setNewSquad(prev => ({ ...prev, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    else if (!/^[a-z0-9_-]+$/.test(form.name)) e.name = 'Use lowercase letters, numbers, _ or -'
    if (!form.role.trim()) e.role = 'Role is required'
    if (!selectedSquadId) e.squad = 'Select a squad'
    if (selectedSquadId === NEW_SQUAD_ID) {
      if (!newSquad.name.trim()) e.new_squad_name = 'New squad name is required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const agent: Agent = {
        name: form.name.trim(),
        role: form.role.trim(),
        model: form.model,
        system_prompt: '',
        skills: [],
        status: 'idle',
      }

      await putAgent(agent.name, agent)

      let targetSquad: Squad | null = existingSquad ?? null
      if (selectedSquadId === NEW_SQUAD_ID) {
        targetSquad = await createSquad({
          name: newSquad.name.trim(),
          description: newSquad.description.trim(),
          lore: newSquad.lore.trim(),
          color: newSquad.color,
          orchestrator: agent.name,
          members: [agent.name],
          telegram_contact_agent: agent.name,
          delegation_policy: 'dynamic',
        })
        onSquadsChanged([...squads, targetSquad])
      } else if (targetSquad) {
        const members = targetSquad.members.includes(agent.name)
          ? targetSquad.members
          : [...targetSquad.members, agent.name]

        const updated = await putSquad(targetSquad.id, { members })
        onSquadsChanged(squads.map(s => (s.id === updated.id ? updated : s)))
        targetSquad = updated
      }

      onCreated({ ...agent, squad_id: targetSquad?.id })
      onOpenChange(false)
      setForm({ name: '', role: '', model: 'openai/gpt-4o-mini' })
      setNewSquad({ name: '', description: '', lore: '', color: '#3b7ff5' })
      toast({ title: 'Agent created' })
    } catch {
      toast({ title: 'Failed to create agent', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="na-name">Name</Label>
              <Input
                id="na-name"
                placeholder="researcher"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="font-mono text-sm"
              />
              {errors.name && <p className="text-xs text-destructive-foreground">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="na-role">Role description</Label>
              <Textarea
                id="na-role"
                placeholder="Describe what this agent does..."
                value={form.role}
                onChange={e => set('role', e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
              {errors.role && <p className="text-xs text-destructive-foreground">{errors.role}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Model</Label>
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm font-mono hover:border-brand/50 transition-colors"
              >
                <span className="truncate">{form.model}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label>Squad</Label>
              <Select value={selectedSquadId} onValueChange={setSelectedSquadId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select squad" />
                </SelectTrigger>
                <SelectContent>
                  {squads.map(squad => (
                    <SelectItem key={squad.id} value={squad.id} className="text-sm">
                      {squad.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_SQUAD_ID} className="text-sm">Create new squad</SelectItem>
                </SelectContent>
              </Select>
              {errors.squad && <p className="text-xs text-destructive-foreground">{errors.squad}</p>}
            </div>

            {selectedSquadId === NEW_SQUAD_ID && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-xs text-muted-foreground">Create and assign new squad</p>
                <div className="space-y-1.5">
                  <Label>Squad name</Label>
                  <Input
                    placeholder="Research"
                    value={newSquad.name}
                    onChange={e => setNewSquadField('name', e.target.value)}
                    className="text-sm"
                  />
                  {errors.new_squad_name && <p className="text-xs text-destructive-foreground">{errors.new_squad_name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="What is this squad responsible for?"
                    value={newSquad.description}
                    onChange={e => setNewSquadField('description', e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Shared lore</Label>
                  <Textarea
                    placeholder="Shared squad guidance for all member agents..."
                    value={newSquad.lore}
                    onChange={e => setNewSquadField('lore', e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Creating...' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModelPicker
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        value={form.model}
        onSelect={id => set('model', id)}
      />
    </>
  )
}
