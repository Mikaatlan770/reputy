'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bell,
  Search,
  Menu,
  AlertTriangle,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function Topbar() {
  const { 
    currentLocation, 
    setCurrentLocation, 
    userLocations, 
    currentUser,
    sidebarOpen,
    toggleSidebar 
  } = useAppStore()

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 bg-card border-b border-border transition-all duration-300',
        sidebarOpen ? 'left-64' : 'left-16'
      )}
    >
      <div className="flex h-full items-center justify-between px-6">
        {/* Left: Mobile menu + Location selector */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Select
            value={currentLocation?.id || ''}
            onValueChange={(value) => {
              const loc = userLocations.find((l) => l.id === value)
              if (loc) setCurrentLocation(loc)
            }}
          >
            <SelectTrigger className="w-[280px] bg-background">
              <SelectValue placeholder="Sélectionner un établissement" />
            </SelectTrigger>
            <SelectContent>
              {userLocations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  <div className="flex items-center gap-2">
                    <span>{location.name}</span>
                    {!location.googleSessionValid && (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    )}
                    {location.healthMode && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Santé
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un avis, un client..."
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center gap-3">
          {/* Session warning */}
          {currentLocation && !currentLocation.googleSessionValid && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-lg border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-medium text-warning">
                Session Google expirée
              </span>
              <Button size="sm" variant="ghost" className="h-6 text-xs">
                Reconnecter
              </Button>
            </div>
          )}

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive text-[10px] font-bold text-white rounded-full flex items-center justify-center">
              3
            </span>
          </Button>

          {/* Profile */}
          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">{currentUser?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {currentUser?.role}
              </p>
            </div>
            <Avatar className="h-9 w-9">
              <AvatarImage src={currentUser?.avatar} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {currentUser ? getInitials(currentUser.name) : 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  )
}





