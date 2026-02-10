'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AlertCircle, Flame, Loader2 } from 'lucide-react'
import { forceWarm } from '@/lib/internal/email-actions'
import { useRouter } from 'next/navigation'

interface ForceWarmButtonProps {
  orgId: string
  orgName?: string
  warmupStatus: string
  variant?: 'default' | 'compact'
}

export function ForceWarmButton({ orgId, orgName, warmupStatus, variant = 'default' }: ForceWarmButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Only show if org is cold or warming
  if (warmupStatus === 'warm') {
    return null
  }

  async function handleForceWarm() {
    setLoading(true)
    setError('')

    const result = await forceWarm({ orgId })

    if (result.ok) {
      setOpen(false)
      router.refresh()
    } else {
      setError(result.error || 'Erreur')
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs">
            <Flame className="h-3.5 w-3.5" />
            Force warm
          </Button>
        ) : (
          <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
            <Flame className="h-4 w-4" />
            Force warm
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>🔥 Force warm-up</DialogTitle>
          <DialogDescription className="text-slate-400">
            L&apos;org <strong className="text-white">{orgName || orgId}</strong> est actuellement en{' '}
            <span className="text-amber-400 font-mono">{warmupStatus}</span>.
            <br /><br />
            Forcer le warm-up passera immédiatement l&apos;org en statut <span className="text-green-400 font-mono">warm</span>,
            supprimant les limites de débit progressif. Les quotas globaux (EMAIL_MAX_PER_HOUR/DAY) restent actifs.
          </DialogDescription>
        </DialogHeader>

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
            onClick={handleForceWarm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            <span className="ml-1.5">Confirmer force warm</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
