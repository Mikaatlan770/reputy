'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QrCode, Nfc, Megaphone, Users2 } from 'lucide-react'
import Link from 'next/link'

const actions = [
  {
    name: 'Générer QR Code',
    description: 'Créer un QR pour collecter des avis',
    icon: QrCode,
    href: '/collect?tab=qr',
    color: 'text-blue-600',
    bg: 'bg-blue-50 hover:bg-blue-100',
  },
  {
    name: 'Tag NFC',
    description: 'Configurer un nouveau tag NFC',
    icon: Nfc,
    href: '/collect?tab=nfc',
    color: 'text-purple-600',
    bg: 'bg-purple-50 hover:bg-purple-100',
  },
  {
    name: 'Campagne',
    description: 'Lancer une campagne SMS/Email',
    icon: Megaphone,
    href: '/campaigns/new',
    color: 'text-green-600',
    bg: 'bg-green-50 hover:bg-green-100',
  },
  {
    name: 'Concurrent',
    description: 'Ajouter un concurrent à surveiller',
    icon: Users2,
    href: '/competitors/add',
    color: 'text-orange-600',
    bg: 'bg-orange-50 hover:bg-orange-100',
  },
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Actions rapides</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link key={action.name} href={action.href}>
              <div
                className={`p-4 rounded-lg ${action.bg} transition-colors cursor-pointer`}
              >
                <action.icon className={`h-6 w-6 ${action.color} mb-2`} />
                <p className="text-sm font-medium text-foreground">
                  {action.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}





