import { Sparkles, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Addon } from '@/lib/pricing-data'

interface AddonCardProps {
  addon: Addon
  className?: string
}

export function AddonCard({ addon, className }: AddonCardProps) {
  const isComingSoon = addon.isComingSoon
  const isPopular = addon.isPopular

  return (
    <div
      className={cn(
        'relative rounded-2xl p-5 border-2 transition-all',
        isComingSoon
          ? 'bg-gray-50 border-gray-200 opacity-75'
          : isPopular
            ? 'bg-white border-primary-200 shadow-md'
            : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm',
        className
      )}
    >
      {/* Badge Populaire */}
      {isPopular && !isComingSoon && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-amber-900 text-xs font-semibold rounded-full">
            <Sparkles className="h-3 w-3" />
          </span>
        </div>
      )}

      {/* Badge Bientôt */}
      {isComingSoon && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-300 text-gray-600 text-xs font-semibold rounded-full">
            <Clock className="h-3 w-3" />
            Bientôt
          </span>
        </div>
      )}

      {/* Nom */}
      <h4
        className={cn(
          'font-semibold mb-1',
          isComingSoon ? 'text-gray-500' : 'text-gray-900'
        )}
      >
        {addon.name}
      </h4>

      {/* Description */}
      <p
        className={cn(
          'text-sm mb-3',
          isComingSoon ? 'text-gray-400' : 'text-gray-500'
        )}
      >
        {addon.description}
      </p>

      {/* Features si présentes */}
      {addon.features && addon.features.length > 0 && (
        <ul className="text-sm space-y-1 mb-3">
          {addon.features.map((f, i) => (
            <li
              key={i}
              className={isComingSoon ? 'text-gray-400' : 'text-gray-600'}
            >
              • {f}
            </li>
          ))}
        </ul>
      )}

      {/* Prix */}
      <div className="mt-auto">
        {isComingSoon ? (
          <span className="text-sm text-gray-400 italic">
            Disponible prochainement
          </span>
        ) : addon.price !== null ? (
          <span className="text-lg font-bold text-primary-900">
            {addon.price}€ <span className="text-sm font-normal text-gray-500">HT</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
