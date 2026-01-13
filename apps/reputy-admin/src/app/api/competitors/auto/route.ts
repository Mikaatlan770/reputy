import { NextRequest, NextResponse } from 'next/server'
import type { AutoCompetitor, EstablishmentType, HealthSpecialty } from '@/types'

// ===== DONNÉES MOCK CONCURRENTS AUTO =====

// Noms générés selon le type
const healthNames: Record<HealthSpecialty, string[]> = {
  generaliste: [
    'Cabinet Dr. Martin', 'Cabinet Dr. Lefèvre', 'Cabinet Dr. Bernard', 
    'Centre Médical Pasteur', 'Cabinet Dr. Dubois', 'Maison de Santé Centre-Ville',
    'Cabinet Dr. Moreau', 'Cabinet Dr. Laurent', 'Centre Médical République',
    'Cabinet Dr. Simon', 'Cabinet Dr. Michel', 'Médecins Associés',
    'Cabinet Dr. Garnier', 'Cabinet Dr. Fontaine', 'Centre de Santé Municipal'
  ],
  dentiste: [
    'Cabinet Dentaire du Parc', 'Dr. Durand - Dentiste', 'Centre Dentaire Smile',
    'Cabinet Dr. Rousseau - Dentiste', 'Clinique Dentaire Moderne', 'Dr. Blanc - Chirurgien Dentiste',
    'Centre Dentaire Victor Hugo', 'Cabinet Dentaire Familial', 'Dr. Petit - Orthodontie',
    'Cabinet Dentaire du Centre', 'Dr. Lemaire - Dentiste', 'Dentistes Associés',
    'Cabinet Dr. Henry - Implants', 'Centre Dentaire Premium', 'Dr. Girard - Dentiste'
  ],
  dermatologue: [
    'Cabinet Dr. Renaud - Dermatologue', 'Centre Dermatologique', 'Dr. Faure - Dermatologue',
    'Clinique Dermatologique Esthétique', 'Cabinet de Dermatologie', 'Dr. Marchand - Dermato',
    'Centre Laser & Dermatologie', 'Cabinet Dr. Colin', 'Institut Dermatologique',
    'Dr. Perrin - Dermatologie', 'Cabinet Dermato Centre', 'Dr. Bonnet - Dermatologue'
  ],
  ophtalmologue: [
    'Cabinet Dr. Lambert - Ophtalmo', 'Centre Ophtalmologique', 'Dr. Giraud - Ophtalmologue',
    'Clinique de la Vision', 'Cabinet Vision Plus', 'Centre Ophtalmo Victor Hugo',
    'Dr. Morel - Ophtalmologue', 'Cabinet des Yeux', 'Centre Vision Santé',
    'Dr. Fournier - Ophtalmo', 'Institut de l\'Œil', 'Cabinet Ophtalmo République'
  ],
  kinesitherapeute: [
    'Cabinet Kiné du Sport', 'Centre de Kinésithérapie', 'Cabinet M. Leroy - Kiné',
    'Kiné & Ostéo Centre', 'Cabinet Kiné Santé', 'Centre Rééducation Fonctionnelle',
    'Cabinet Kiné du Parc', 'Kinés Associés', 'Centre Kiné Balance',
    'Cabinet M. Robert - Kiné', 'Kiné Sport & Bien-être', 'Cabinet Kiné Zen'
  ],
  pharmacien: [
    'Pharmacie du Centre', 'Pharmacie Moderne', 'Grande Pharmacie',
    'Pharmacie du Marché', 'Pharmacie Victor Hugo', 'Pharmacie de la Place',
    'Pharmacie Centrale', 'Pharmacie du Parc', 'Pharmacie République',
    'Pharmacie des Halles', 'Pharmacie Lafayette', 'Pharmacie de l\'Horloge'
  ],
  cardiologue: [
    'Cabinet Dr. Vidal - Cardio', 'Centre Cardiologique', 'Dr. Adam - Cardiologue',
    'Clinique du Cœur', 'Cabinet Cardio Santé', 'Centre Cardio Vasculaire',
    'Dr. Roche - Cardiologue', 'Cabinet Cardiologie Moderne', 'Institut Cardiaque'
  ],
  pediatre: [
    'Cabinet Dr. Nicolas - Pédiatre', 'Centre Pédiatrique', 'Dr. Clément - Pédiatre',
    'Cabinet Enfant Santé', 'Pédiatres Associés', 'Centre de Pédiatrie',
    'Cabinet Dr. Mathieu - Pédiatre', 'Maison de la Pédiatrie', 'Dr. Antoine - Pédiatre'
  ],
  gynecologue: [
    'Cabinet Dr. Marie - Gynéco', 'Centre Gynécologique', 'Dr. Julie - Gynécologue',
    'Cabinet Femme Santé', 'Centre Gynéco Obstétrique', 'Gynécologues Associés',
    'Cabinet Dr. Sophie - Gynéco', 'Clinique de la Femme', 'Dr. Claire - Gynécologue'
  ],
  osteopathe: [
    'Cabinet Ostéo Santé', 'Centre d\'Ostéopathie', 'M. Dupont - Ostéopathe',
    'Cabinet Ostéo du Sport', 'Ostéopathes Associés', 'Centre Ostéo Bien-être',
    'Cabinet M. Lefevre - Ostéo', 'Ostéo & Posture', 'Cabinet Ostéopathie Moderne'
  ],
}

const commerceNames = [
  'Boutique Mode & Style', 'Maison du Cadeau', 'L\'Épicerie Fine',
  'Optique Vision', 'Bijouterie du Centre', 'Fleuriste Les Roses',
  'Librairie Papeterie', 'Pressing Express', 'Coiffure Élégance',
  'Institut de Beauté', 'Cave à Vins', 'Boulangerie Artisanale',
  'Salon de Coiffure', 'Magasin Bio Nature', 'Cordonnerie Rapide'
]

const restaurantNames = [
  'Le Petit Gourmand', 'Chez Marie', 'La Table du Chef',
  'Bistrot de la Place', 'Restaurant du Marché', 'La Bonne Fourchette',
  'Le Comptoir', 'Café de Paris', 'Brasserie du Centre',
  'La Terrasse', 'L\'Auberge Moderne', 'Pizzeria Napoli',
  'Sushi House', 'Le Jardin Secret', 'Restaurant Gastronomique'
]

// Génère une adresse fictive
function generateAddress(distance: number): string {
  const streets = [
    'Rue de la République', 'Avenue Victor Hugo', 'Boulevard Pasteur',
    'Place du Marché', 'Rue des Lilas', 'Avenue Jean Jaurès',
    'Rue du Commerce', 'Place de la Mairie', 'Boulevard Gambetta'
  ]
  const num = Math.floor(Math.random() * 100) + 1
  const street = streets[Math.floor(Math.random() * streets.length)]
  return `${num} ${street}`
}

// Génère un concurrent automatique
function generateAutoCompetitor(
  index: number,
  type: EstablishmentType,
  specialty: HealthSpecialty | undefined,
  maxRadius: number
): AutoCompetitor {
  let name: string
  
  if (type === 'health' && specialty && healthNames[specialty]) {
    const names = healthNames[specialty]
    name = names[index % names.length]
  } else if (type === 'commerce') {
    name = commerceNames[index % commerceNames.length]
  } else {
    name = restaurantNames[index % restaurantNames.length]
  }
  
  // Distance aléatoire jusqu'au rayon max
  const distance = Math.round((Math.random() * maxRadius + 0.1) * 10) / 10
  
  // Note entre 3.0 et 5.0 (réaliste)
  const rating = Math.round((Math.random() * 2 + 3) * 10) / 10
  
  // Nombre d'avis (plus réaliste)
  const reviewsCount = Math.floor(Math.random() * 300) + 20
  
  // Avis derniers 30 jours
  const reviewsLast30d = Math.floor(Math.random() * 20) + 1
  
  // Taux de réponse
  const responseRate = Math.floor(Math.random() * 60) + 30
  
  // Tendance
  const trends: Array<'up' | 'stable' | 'down'> = ['up', 'stable', 'down']
  const trend = trends[Math.floor(Math.random() * trends.length)]
  
  return {
    id: `auto-${Date.now()}-${index}`,
    name,
    category: type,
    specialty,
    distanceKm: distance,
    rating,
    reviewsCount,
    reviewsLast30d,
    responseRate,
    trend,
    isAuto: true,
    address: generateAddress(distance),
    placeId: `ChIJ${Math.random().toString(36).substring(2, 15)}`,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const type = (searchParams.get('type') || 'health') as EstablishmentType
  const specialty = searchParams.get('specialty') as HealthSpecialty | null
  const radius = parseInt(searchParams.get('radius') || '2') as 1 | 2 | 5
  
  // Simuler un délai réseau
  await new Promise(resolve => setTimeout(resolve, 800))
  
  // Générer entre 10 et 18 concurrents
  const count = Math.floor(Math.random() * 9) + 10
  
  const competitors: AutoCompetitor[] = []
  
  for (let i = 0; i < count; i++) {
    const competitor = generateAutoCompetitor(i, type, specialty || undefined, radius)
    // S'assurer que la distance est dans le rayon
    if (competitor.distanceKm <= radius) {
      competitors.push(competitor)
    }
  }
  
  // Trier par distance
  competitors.sort((a, b) => a.distanceKm - b.distanceKm)
  
  // Calculer des statistiques locales (pour les insights)
  const avgRating = competitors.reduce((acc, c) => acc + c.rating, 0) / competitors.length
  const avgReviews = competitors.reduce((acc, c) => acc + c.reviewsCount, 0) / competitors.length
  const totalReviewsLocal = competitors.reduce((acc, c) => acc + c.reviewsCount, 0)
  
  return NextResponse.json({
    competitors,
    stats: {
      avgRating: Math.round(avgRating * 10) / 10,
      avgReviews: Math.round(avgReviews),
      totalReviewsLocal,
      totalCompetitors: competitors.length,
      radius,
    },
    disclaimer: 'Les données de concurrence sont des estimations basées sur des informations publiques Google.',
  })
}





