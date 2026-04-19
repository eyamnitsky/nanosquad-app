'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getSkills, createSkill, deleteSkill, type Skill } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

const SKILL_SCAFFOLD = `# Skill metadata / notes
# This text is stored with the skill record.
# Runtime implementation should exist in NemoClaw tools/plugins.
`

function SkillRow({
  skill,
  onDelete,
}: {
  skill: Skill
  onDelete: (name: string) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <>
      <div className="group border-b border-border last:border-0 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-medium text-foreground">{skill.name}</span>
              {skill.agents.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {skill.agents.map(a => (
                    <span key={a} className="rounded-full bg-brand-muted px-2 py-0.5 text-xs font-mono text-brand">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive-foreground shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill &ldquo;{skill.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the skill definition. Agents that reference this skill will need to be updated manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmOpen(false); onDelete(skill.name) }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function SkillsPage() {
  const { toast } = useToast()
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', code: SKILL_SCAFFOLD })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    getSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
  }, [])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    else if (!/^[a-z0-9_]+$/.test(form.name)) e.name = 'Use lowercase letters, numbers, and underscores only'
    if (!form.description.trim()) e.description = 'Description is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const created = await createSkill({
        name: form.name.trim(),
        description: form.description.trim(),
        code: form.code,
      }).catch(() => ({
        name: form.name.trim(),
        description: form.description.trim(),
        code: form.code,
        agents: [],
      }))
      setSkills(prev => prev ? [...prev, created] : [created])
      setModalOpen(false)
      setForm({ name: '', description: '', code: SKILL_SCAFFOLD })
      toast({ title: 'Skill registered' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    await deleteSkill(name).catch(() => null)
    setSkills(prev => prev?.filter(s => s.name !== name) ?? null)
    toast({ title: 'Skill deleted' })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {skills ? `${skills.length} skills available` : 'Loading...'}
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Register Skill
        </Button>
      </div>

      {skills === null ? (
        <div className="rounded-lg border border-border divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-medium text-foreground mb-1">No skills yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Skills listed here are registrations that agents can reference. Runtime tool implementation is handled in NemoClaw.
          </p>
          <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Register Skill
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {skills.map(skill => (
            <SkillRow key={skill.name} skill={skill} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Register Skill Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Skill</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              This registers a skill record in NanoSquad. If the skill requires executable logic (for example Python scripts),
              that implementation must exist in NemoClaw runtime tooling.
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sk-name">Name</Label>
              <Input
                id="sk-name"
                placeholder="my_skill"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="font-mono text-sm"
              />
              {errors.name && <p className="text-xs text-destructive-foreground">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sk-desc">Description</Label>
              <Input
                id="sk-desc"
                placeholder="What does this skill do?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm"
              />
              {errors.description && <p className="text-xs text-destructive-foreground">{errors.description}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sk-code">Implementation Notes / Spec</Label>
              <Textarea
                id="sk-code"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                rows={14}
                className="font-mono text-xs resize-y"
                spellCheck={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Registering...' : 'Register Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
