import { Star } from 'lucide-react'
import { TESTIMONIALS } from '@/lib/pricing-data'

export function TestimonialsSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ils nous font confiance
          </h2>
          <p className="text-lg text-gray-600">
            Plus de 500 professionnels utilisent Reputy au quotidien
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.author}
              className="p-6 rounded-2xl bg-gray-50 border border-gray-100"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }, (_, j) => j).map((k) => (
                  <Star
                    key={k}
                    className="h-5 w-5 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>
              <p className="text-gray-700 mb-6">
                &ldquo;{testimonial.content}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-gray-900">
                  {testimonial.author}
                </p>
                <p className="text-sm text-gray-500">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
