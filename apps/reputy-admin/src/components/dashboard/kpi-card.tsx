'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  iconColor?: string
  iconBg?: string
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
}: KpiCardProps) {
  return (
    <Card className="hover:shadow-card-hover transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-foreground">{value}</p>
              {trend && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-medium',
                    trend.isPositive ? 'text-success' : 'text-destructive'
                  )}
                >
                  {trend.isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend.value}%
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn('rounded-lg p-3', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}





