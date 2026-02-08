'use client'

import { Star } from 'lucide-react'

const mockReviews = [
  {
    name: 'Marie L.',
    avatar: 'ML',
    rating: 5,
    text: 'Excellent praticien, très à l\'écoute. Je recommande vivement !',
    date: 'il y a 2 jours',
  },
  {
    name: 'Pierre D.',
    avatar: 'PD',
    rating: 5,
    text: 'Cabinet moderne et équipe très professionnelle. Merci !',
    date: 'il y a 1 semaine',
  },
  {
    name: 'Sophie M.',
    avatar: 'SM',
    rating: 4,
    text: 'Très bon accueil, je reviendrai sans hésiter.',
    date: 'il y a 2 semaines',
  },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

export function WidgetPreview() {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Avis Google</div>
            <div className="flex items-center gap-1">
              <StarRating rating={5} />
              <span className="text-xs text-gray-500 ml-1">4.9 (127 avis)</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-full">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="text-[10px] text-gray-500 font-medium">Google</span>
        </div>
      </div>

      {/* Reviews */}
      <div className="space-y-3">
        {mockReviews.map((review, i) => (
          <div
            key={i}
            className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-700">
                  {review.avatar}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {review.name}
                  </span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {review.date}
                  </span>
                </div>
                <StarRating rating={review.rating} />
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {review.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Propulsé par Reputy</span>
        <button className="text-xs font-medium text-primary-600 hover:text-primary-700">
          Voir tous les avis →
        </button>
      </div>
    </div>
  )
}
