'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { locations } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { formatDate } from '@/lib/utils'
import {
  Plus,
  Building2,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Settings,
  Star,
} from 'lucide-react'

export default function LocationsPage() {
  const { setCurrentLocation, currentLocation } = useAppStore()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Établissements</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos différents points de vente
          </p>
        </div>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          Ajouter un établissement
        </Button>
      </div>

      {/* Locations Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((location) => (
          <Card
            key={location.id}
            className={`hover:shadow-card-hover transition-all cursor-pointer ${
              currentLocation?.id === location.id
                ? 'ring-2 ring-primary'
                : ''
            }`}
            onClick={() => setCurrentLocation(location)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex gap-1">
                  {currentLocation?.id === location.id && (
                    <Badge variant="default">Actif</Badge>
                  )}
                  {location.healthMode && (
                    <Badge variant="secondary">Santé</Badge>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-lg">{location.name}</h3>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4" />
                {location.address}, {location.city}
              </div>

              <div className="mt-4 pt-4 border-t border-border space-y-3">
                {/* Google Status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Google Business</span>
                  {location.googleConnected ? (
                    location.googleSessionValid ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Connecté
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Session expirée
                      </Badge>
                    )
                  ) : (
                    <Badge variant="secondary">Non connecté</Badge>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Note moyenne</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-medium">4.3</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Créé le</span>
                  <span className="text-sm">{formatDate(location.createdAt)}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentLocation(location)
                  }}
                >
                  Sélectionner
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add New Card */}
        <Card className="border-dashed hover:border-primary transition-colors cursor-pointer">
          <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[280px]">
            <div className="p-3 bg-muted rounded-full mb-3">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Ajouter un établissement</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Connectez un nouveau point de vente
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}





