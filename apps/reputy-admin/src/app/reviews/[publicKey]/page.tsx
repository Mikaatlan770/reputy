// ===== PAGE PUBLIQUE SSR: /reviews/[publicKey] =====
// Page SEO-friendly avec les avis d'un établissement
// Server-only — aucun token exposé au client

import { notFound } from 'next/navigation'
import { fetchReviewsByPublicKey, getReviewsMetadata } from '@/lib/internal/reviews-actions'
import { Star } from 'lucide-react'

interface PageProps {
  params: Promise<{ publicKey: string }>
}

// Forcer le rendu dynamique pour SSR
export const dynamic = 'force-dynamic'

// Métadonnées SEO
export async function generateMetadata({ params }: PageProps) {
  const { publicKey } = await params
  return getReviewsMetadata(publicKey)
}

function StarRating({ rating, size = 20 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}
        />
      ))}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default async function PublicReviewsPage({ params }: PageProps) {
  const { publicKey } = await params
  const data = await fetchReviewsByPublicKey(publicKey)
  
  if (!data) {
    notFound()
  }
  
  const { items, locationName, averageRating, totalCount, config } = data
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
            <span className="text-3xl font-bold">R</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">{locationName}</h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            <StarRating rating={Math.round(averageRating)} size={24} />
            <span className="text-xl font-semibold">
              {averageRating.toFixed(1)}/5
            </span>
            <span className="text-white/80">
              ({totalCount} avis)
            </span>
          </div>
        </div>
      </header>
      
      {/* Liste des avis */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Aucun avis disponible pour le moment.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
                itemScope
                itemType="https://schema.org/Review"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="font-semibold text-indigo-600">
                          {item.initials.split('.')[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900" itemProp="author">
                          {item.initials}
                        </p>
                        {config.showDate && (
                          <time
                            className="text-sm text-gray-500"
                            dateTime={item.date}
                            itemProp="datePublished"
                          >
                            {formatDate(item.date)}
                          </time>
                        )}
                      </div>
                    </div>
                  </div>
                  {config.showStars && (
                    <div itemProp="reviewRating" itemScope itemType="https://schema.org/Rating">
                      <meta itemProp="ratingValue" content={item.rating.toString()} />
                      <meta itemProp="bestRating" content="5" />
                      <StarRating rating={item.rating} size={18} />
                    </div>
                  )}
                </div>
                
                {item.text && (
                  <p className="mt-4 text-gray-700 leading-relaxed" itemProp="reviewBody">
                    &ldquo;{item.text}&rdquo;
                  </p>
                )}
                
                {config.showSource && (
                  <div className="mt-3 text-xs text-gray-400">
                    {item.source === 'google' ? '📍 Avis Google' : '✓ Avis vérifié'}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        
        {/* Footer avec lien Reputy */}
        <footer className="mt-12 text-center text-sm text-gray-400">
          <p>
            Avis collectés et vérifiés par{' '}
            <a
              href="https://reputy.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline"
            >
              Reputy
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
