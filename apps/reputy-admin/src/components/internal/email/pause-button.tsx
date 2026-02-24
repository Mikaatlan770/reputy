'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, Pause, Play } from 'lucide-react'
import { pauseOrg } from '@/lib/internal/email-actions'
import { useRouter } from 'next/navigation'

interface PauseButtonProps {
  orgId: string
  orgName?: string
  isPaused: boolean
  currentReason?: string | null
  variant?: 'default' | 'compact'
}

export function PauseButton({ orgId, orgName, isPaused, currentReason, variant = 'default' }: PauseButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  async function handleAction() {
    setLoading(true)
    setError('')

    const result = await pauseOrg({
      orgId,
      paused: !isPaused,
      reason: !isPaused ? (reason || 'admin_manual') : undefined,
    })

    if (result.ok) {
      setOpen(false)
      setReason('')
      router.refresh()
    } else {
      setError(result.error || 'Erreur')
    }
    setLoading(false)
  }

  const actionLabel = isPaused ? 'Reprendre les emails' : 'Pause emails'
  const actionIcon = isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />
  const buttonColor = isPaused
    ? 'bg-green-600 hover:bg-green-700 text-white'
    : 'bg-red-600 hover:bg-red-700 text-white'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button size="sm" className={buttonColor + ' gap-1.5 text-xs'}>
            {actionIcon}
            {isPaused ? 'Reprendre' : 'Pause'}
          </Button>
        ) : (
          <Button className={buttonColor + ' gap-2'}>
            {actionIcon}
            {actionLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>
            {isPaused ? '▶️ Reprendre les emails' : '⏸️ Mettre en pause les emails'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isPaused
              ? `Les emails de ${orgName || orgId} reprendront immédiatement.`
              : `Tous les emails de ${orgName || orgId} seront mis en pause. Les emails en attente resteront en "pending".`
            }
          </DialogDescription>
        </DialogHeader>

        {!isPaused && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">
              Raison (recommandé)
            </p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: complaint_rate_red, investigation..."
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>
        )}

        {isPaused && currentReason && (
          <div className="p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400">Raison de la pause actuelle :</p>
            <p className="text-sm text-amber-400 font-mono">{currentReason}</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-slate-600 text-slate-300"
          >
            Annuler
          </Button>
          <Button
            onClick={handleAction}
            disabled={loading}
            className={buttonColor}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionIcon}
            <span className="ml-1.5">{isPaused ? 'Reprendre' : 'Confirmer la pause'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
