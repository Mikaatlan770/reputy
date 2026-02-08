import Link from 'next/link'
import {
  Stethoscope,
  UtensilsCrossed,
  Building2,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Vertical } from '@/lib/pricing-data'

interface VerticalCardProps {
  vertical: Vertical
  className?: string
}

const iconMap = {
  Stethoscope,
  UtensilsCrossed,
  Building2,
}

const colorMap = {
  health: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    hoverBorder: 'hover:border-sky-400',
    hoverShadow: 'hover:shadow-sky-100/50',
  },
  food: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    hoverBorder: '',
    hoverShadow: '',
  },
  business: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    hoverBorder: '',
    hoverShadow: '',
  },
}

export function VerticalCard({ vertical, className }: VerticalCardProps) {
  const Icon = iconMap[vertical.icon as keyof typeof iconMap]
  const colors = colorMap[vertical.id as keyof typeof colorMap]
  const isAvailable = vertical.isAvailable

  const CardContent = (
    <>
      {/* Badge "Bientôt" */}
      {!isAvailable && (
        <div className="absolute top-4 right-4">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded-full">
            <Clock className="h-3 w-3" />
            Bientôt
          </span>
        </div>
      )}

      {/* Icône */}
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-colors',
          colors.iconBg,
          isAvailable && 'group-hover:scale-110 transition-transform'
        )}
      >
        {Icon && (
          <Icon
            className={cn('h-8 w-8', colors.iconColor, !isAvailable && 'opacity-50')}
          />
        )}
      </div>

      {/* Nom */}
      <h3
        className={cn(
          'text-xl font-bold mb-2',
          isAvailable ? 'text-gray-900' : 'text-gray-500'
        )}
      >
        {vertical.name}
      </h3>

      {/* Tagline */}
      <p
        className={cn(
          'text-sm font-medium mb-3',
          isAvailable ? 'text-primary-600' : 'text-gray-400'
        )}
      >
        {vertical.tagline}
      </p>

      {/* Description */}
      <p
        className={cn(
          'text-sm mb-6',
          isAvailable ? 'text-gray-600' : 'text-gray-400'
        )}
      >
        {vertical.description}
      </p>

      {/* CTA */}
      {isAvailable ? (
        <div className="flex items-center gap-2 text-primary-700 font-semibold group-hover:gap-3 transition-all">
          Découvrir
          <ArrowRight className="h-4 w-4" />
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic">
          Disponible prochainement
        </div>
      )}
    </>
  )

  if (isAvailable && vertical.href) {
    return (
      <Link
        href={vertical.href}
        className={cn(
          'group relative block p-8 rounded-3xl border-2 transition-all',
          colors.bg,
          colors.border,
          colors.hoverBorder,
          'hover:shadow-xl',
          colors.hoverShadow,
          className
        )}
      >
        {CardContent}
      </Link>
    )
  }

  return (
    <div
      className={cn(
        'relative p-8 rounded-3xl border-2 cursor-not-allowed',
        'bg-gray-50 border-gray-200',
        className
      )}
    >
      {CardContent}
    </div>
  )
}
