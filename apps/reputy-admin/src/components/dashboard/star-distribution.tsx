'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { starDistribution } from '@/lib/mock-data'
import { Star } from 'lucide-react'

export function StarDistribution() {
  const total = starDistribution.reduce((sum, s) => sum + s.count, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Distribution des notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {starDistribution.map((item) => (
            <div key={item.stars} className="flex items-center gap-3">
              <div className="flex items-center gap-1 w-16">
                <span className="text-sm font-medium">{item.stars}</span>
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              </div>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground w-12 text-right">
                {item.count}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total avis</span>
            <span className="font-semibold">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}





