'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { threads, reviews } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { formatDateTime, getInitials } from '@/lib/utils'
import {
  MessageSquare,
  Star,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react'

export default function InboxPage() {
  const { currentLocation } = useAppStore()

  const unrepliedReviews = reviews
    .filter((r) => !currentLocation || r.locationId === currentLocation.id)
    .filter((r) => !r.responded)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredThreads = threads.filter(
    (t) => !currentLocation || t.locationId === currentLocation.id
  )

  const allItems = [
    ...unrepliedReviews.map((r) => ({ type: 'review' as const, data: r, date: r.date })),
    ...filteredThreads.map((t) => ({ type: 'thread' as const, data: t, date: t.lastMessageAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Réponses (Inbox)</h1>
        <p className="text-muted-foreground mt-1">
          Centralisez vos avis à traiter et vos messages
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">À traiter</p>
                <p className="text-2xl font-bold">{unrepliedReviews.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold">
                  {filteredThreads.filter((t) => t.status === 'pending').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Traités aujourd'hui</p>
                <p className="text-2xl font-bold">5</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inbox */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tous les éléments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="font-semibold">Inbox vide !</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tous les éléments ont été traités.
                </p>
              </div>
            ) : (
              allItems.map((item) => (
                <div
                  key={item.type === 'review' ? item.data.id : item.data.id}
                  className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  {item.type === 'review' ? (
                    <>
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(item.data.author)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="google" className="text-[10px]">
                            Avis Google
                          </Badge>
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-3 w-3 ${
                                  s <= item.data.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="font-medium mt-1">{item.data.author}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {item.data.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(item.date)}
                        </p>
                      </div>
                      <Button size="sm">Répondre</Button>
                    </>
                  ) : (
                    <>
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <MessageSquare className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {item.data.type === 'support' ? 'Support' : 'Message'}
                          </Badge>
                          <Badge
                            variant={
                              item.data.priority === 'high'
                                ? 'destructive'
                                : item.data.priority === 'medium'
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {item.data.priority}
                          </Badge>
                        </div>
                        <p className="font-medium mt-1">{item.data.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(item.date)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.data.status === 'open'
                            ? 'success'
                            : item.data.status === 'pending'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {item.data.status === 'open' && 'Ouvert'}
                        {item.data.status === 'pending' && 'En attente'}
                        {item.data.status === 'closed' && 'Fermé'}
                      </Badge>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





