import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import {
  HealthHero,
  HealthFeatures,
  ReputyBoardSection,
  DoctolibSection,
  PricingSection,
  AddonsSection,
  QrNfcSection,
  HealthFAQ,
  HealthCTA,
} from '@/components/health'

export const metadata = {
  title: 'Reputy Health – Avis Google pour cabinets médicaux',
  description:
    "Collecte d'avis patients, réponses IA et suivi multi-sites. Conçu pour médecins, dentistes et centres de santé. Conforme RGPD. Démo gratuite.",
}

export default function HealthPage() {
  return (
    <>
      <Header />

      <main>
        {/* 1. Hero Health */}
        <HealthHero />

        {/* 2. Fonctionnalités */}
        <HealthFeatures />

        {/* 3. ReputyBoard */}
        <ReputyBoardSection />

        {/* 4. Module Doctolib */}
        <DoctolibSection />

        {/* 5. Forfaits */}
        <PricingSection />

        {/* 6. Packs additionnels */}
        <AddonsSection />

        {/* 7. QR & NFC */}
        <QrNfcSection />

        {/* 8. FAQ */}
        <HealthFAQ />

        {/* 9. CTA final */}
        <HealthCTA />
      </main>

      <Footer />
    </>
  )
}
