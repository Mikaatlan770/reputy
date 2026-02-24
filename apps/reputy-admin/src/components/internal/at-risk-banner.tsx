'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AtRiskOrg } from '@/lib/internal/fetch-internal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  Send,
  LogIn,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AtRiskBannerProps {
  atRiskOrgs: AtRiskOrg[]
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDaysAgo(days: number | null): string {
  if (days === null) return 'Jamais'
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  return `Il y a ${days}j`
}

export function AtRiskBanner({ atRiskOrgs }: AtRiskBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (!atRiskOrgs || atRiskOrgs.length === 0) return null

  return (
    <Card className="bg-amber-500/5 border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Payants non activés
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              {atRiskOrgs.length}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-white h-7 px-2"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Ces clients ont un abonnement actif mais n'ont jamais envoyé de demande d'avis.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {atRiskOrgs.map((org) => {
              const loginColorClass = org.daysSinceLastLogin !== null && org.daysSinceLastLogin > 14
                ? 'text-red-400'
                : org.daysSinceLastLogin !== null && org.daysSinceLastLogin > 7 ? 'text-amber-400' : ''
              return (<Link key={org.id} href={`/internal/clients/${org.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-amber-500/40 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm truncate">
                        {org.name}
                      </span>
                      {org.planCode && (
                        <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600">
                          {org.planCode}
                        </Badge>
                      )}
                    </div>
                    {org.email && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3 text-slate-500" />
                        <span className="text-xs text-slate-500">{org.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {/* Last login */}
                    <div className="flex items-center gap-1" title="Dernier login">
                      <LogIn className="h-3 w-3" />
                      <span className={cn(loginColorClass)}>
                        {formatDaysAgo(org.daysSinceLastLogin)}
                      </span>
                    </div>

                    {/* Last sent */}
                    <div className="flex items-center gap-1" title="Dernier envoi">
                      <Send className="h-3 w-3" />
                      <span>{org.lastSentAt ? formatDate(org.lastSentAt) : 'Aucun'}</span>
                    </div>

                    {/* Created */}
                    <div className="flex items-center gap-1" title="Créé le">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(org.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </Link>
              </Link>)}
          )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
