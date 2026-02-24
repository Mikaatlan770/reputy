'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function KpiCardSkeleton() {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4">
        <Skeleton className="h-3 w-20 bg-slate-700 mb-2" />
        <Skeleton className="h-8 w-16 bg-slate-700" />
      </CardContent>
    </Card>
  )
}

export function HealthDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64 bg-slate-700" />
        <Skeleton className="h-9 w-32 bg-slate-700" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((k) => (
          <KpiCardSkeleton key={k} />
        ))}
      </div>

      {/* Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <Skeleton className="h-5 w-40 bg-slate-700" />
        </CardHeader>
        <CardContent>
          {[0, 1, 2, 3, 4].map((k) => (
            <Skeleton key={k} className="h-10 w-full bg-slate-700 mb-2" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export function AlertsTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48 bg-slate-700" />
        <Skeleton className="h-9 w-32 bg-slate-700" />
      </div>
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Skeleton key={k} className="h-12 w-full bg-slate-700 mb-2" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export function OrgDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-72 bg-slate-700" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((k) => (
          <KpiCardSkeleton key={k} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-32 bg-slate-700 mb-4" />
            <Skeleton className="h-20 w-full bg-slate-700" />
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-32 bg-slate-700 mb-4" />
            <Skeleton className="h-20 w-full bg-slate-700" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
