import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import {
  HeroSection,
  StatsSection,
  VerticalsSection,
  FeaturesSection,
  HowItWorksSection,
  TestimonialsSection,
  CTASection,
  AppSection,
} from '@/components/home'

export default function HomePage() {
  return (
    <>
      <Header />

      <main>
        {/* 1. Hero */}
        <HeroSection />

        {/* 2. Stats */}
        <StatsSection />

        {/* 3. Verticales (Health, Food, Business) */}
        <VerticalsSection />

        {/* 4. Fonctionnalités */}
        <FeaturesSection />

        {/* 5. Comment ça marche */}
        <HowItWorksSection />

        {/* 6. Témoignages */}
        <TestimonialsSection />

        {/* 7. CTA final */}
        <CTASection />

        {/* 8. Application mobile */}
        <AppSection />
      </main>

      <Footer />
    </>
  )
}
