'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Star, ArrowRight, AlertTriangle } from 'lucide-react'
import { reviews } from '@/lib/mock-data'
import { formatDate, getInitials, truncate } from '@/lib/utils'
import Link from 'next/link'

export function PendingReviews() {
  // Get unreplied reviews with rating < 4 or all unreplied
  const pendingReviews = reviews
    .filter((r) => !r.responded)
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          À traiter
          <Badge variant="destructive" className="ml-2">
            {pendingReviews.length}
          </Badge>
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reviews?status=unreplied">
            Voir tout <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pendingReviews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>🎉 Tous les avis ont été traités !</p>
            </div>
          ) : (
            pendingReviews.map((review) => (
              <div
                key={review.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(review.author)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {review.author}
                    </p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3.5 w-3.5 ${
                            star <= review.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {truncate(review.content, 80)}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(review.date)}
                    </span>
                    {review.rating <= 2 && (
                      <Badge variant="destructive" className="text-[10px] h-5">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Urgent
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}





