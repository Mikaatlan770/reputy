import Link from 'next/link'
import { CheckCircle, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/pricing-data'

interface PricingCardProps {
  plan: Plan
  className?: string
}

export function PricingCard({ plan, className }: PricingCardProps) {
  const isPopular = plan.isPopular
  const isTrial = plan.isTrial

  // Couleurs par plan
  const planColors: Record<string, { bg: string; border: string; accent: string }> = {
    bronze: {
      bg: 'bg-gradient-to-br from-amber-700 to-amber-900',
      border: 'border-amber-600',
      accent: 'text-amber-400',
    },
    argent: {
      bg: 'bg-gradient-to-br from-slate-500 to-slate-700',
      border: 'border-slate-400',
      accent: 'text-slate-300',
    },
    platinum: {
      bg: 'bg-gradient-to-br from-slate-800 to-slate-950',
      border: 'border-slate-600',
      accent: 'text-slate-300',
    },
  }

  const colors = planColors[plan.id]

  return (
    <div
      className={cn(
        'relative rounded-3xl p-8 transition-all duration-300',
        isPopular
          ? `${colors.bg} text-white ring-4 ring-primary-400 ring-offset-4 shadow-2xl`
          : 'bg-white border-2 border-gray-100 hover:border-gray-200 hover:shadow-lg',
        className
      )}
    >
      {/* Badge Populaire */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-4 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full shadow-lg">
            <Sparkles className="h-4 w-4" />
            Populaire
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        {/* Nom du plan avec icône colorée */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span
            className={cn(
              'w-4 h-4 rounded-full',
              plan.id === 'bronze' && 'bg-amber-700',
              plan.id === 'argent' && 'bg-slate-400',
              plan.id === 'platinum' && 'bg-slate-800'
            )}
          />
          <h3
            className={cn(
              'text-2xl font-bold',
              isPopular
                ? 'text-white'
                : plan.id === 'platinum'
                  ? 'bg-gradient-to-r from-slate-500 to-slate-700 bg-clip-text text-transparent'
                  : 'text-gray-900'
            )}
          >
            {plan.name}
          </h3>
        </div>

        <p
          className={cn(
            'text-sm mb-4',
            isPopular ? 'text-white/80' : 'text-gray-500'
          )}
        >
          {plan.subtitle}
        </p>

        {/* Prix */}
        <div className="flex items-baseline justify-center gap-1">
          {isTrial ? (
            <>
              <span
                className={cn(
                  'text-5xl font-bold',
                  isPopular ? 'text-white' : 'text-gray-900'
                )}
              >
                Gratuit
              </span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  'text-5xl font-bold',
                  isPopular
                    ? 'text-white'
                    : plan.id === 'platinum'
                      ? 'bg-gradient-to-r from-slate-500 to-slate-700 bg-clip-text text-transparent'
                      : 'text-gray-900'
                )}
              >
                {plan.price}€
              </span>
              <span className={isPopular ? 'text-white/70' : 'text-gray-500'}>
                {plan.period}
              </span>
            </>
          )}
        </div>
        {isTrial && (
          <p
            className={cn(
              'text-sm mt-1',
              isPopular ? 'text-white/70' : 'text-gray-500'
            )}
          >
            {plan.period}
          </p>
        )}
      </div>

      {/* Features incluses */}
      <ul className="space-y-3 mb-8">
        {plan.included.map((feature, j) => (
          <li key={j} className="flex items-start gap-3">
            <CheckCircle
              className={cn(
                'h-5 w-5 flex-shrink-0 mt-0.5',
                isPopular ? 'text-green-400' : 'text-green-500'
              )}
            />
            <span className={isPopular ? 'text-white/90' : 'text-gray-700'}>
              {feature}
            </span>
          </li>
        ))}
        {/* Features exclues */}
        {plan.excluded.map((feature, j) => (
          <li key={`ex-${j}`} className="flex items-start gap-3">
            <X
              className={cn(
                'h-5 w-5 flex-shrink-0 mt-0.5',
                isPopular ? 'text-white/40' : 'text-gray-300'
              )}
            />
            <span
              className={cn(
                'line-through',
                isPopular ? 'text-white/40' : 'text-gray-400'
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={plan.ctaHref}
        className={cn(
          'block w-full py-3 px-6 rounded-xl font-semibold text-center transition-all',
          isPopular
            ? 'bg-white text-gray-900 hover:bg-gray-100 shadow-lg'
            : isTrial
              ? 'bg-primary-900 text-white hover:bg-primary-950'
              : 'bg-primary-900 text-white hover:bg-primary-950'
        )}
      >
        {plan.cta}
      </Link>
    </div>
  )
}
