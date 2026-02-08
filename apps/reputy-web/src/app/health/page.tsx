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
  title: 'Reputy Health - Gestion de réputation pour professionnels de santé',
  description:
    'Collectez des avis patients, gérez votre réputation Google et répondez à tous vos avis depuis un tableau de bord unique. Conforme RGPD, hébergement France.',
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
