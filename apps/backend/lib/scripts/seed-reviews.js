#!/usr/bin/env node
/**
 * Seed Reviews Script
 * 
 * Populates the reviews table with sample data for testing.
 * Usage: USE_SQLITE=1 node lib/scripts/seed-reviews.js [orgId]
 * 
 * If no orgId is provided, uses the first org in the database.
 */

require('dotenv').config();

const db = require('../db');
const reviewRepo = require('../repositories/review.repo');

// Sample review data
const SAMPLE_AUTHORS = [
  'Marie Dupont', 'Jean Martin', 'Sophie Bernard', 'Pierre Durand',
  'Isabelle Moreau', 'François Petit', 'Céline Roux', 'Nicolas Simon',
  'Émilie Laurent', 'Thomas Lefebvre', 'Charlotte Morel', 'Alexandre Fournier',
  'Julie Girard', 'Maxime Bonnet', 'Camille Mercier', 'Antoine Dubois'
];

const SAMPLE_COMMENTS = {
  5: [
    'Excellent praticien, très à l\'écoute et professionnel. Je recommande vivement !',
    'Rendez-vous rapide, médecin très compétent. Cabinet propre et accueillant.',
    'Très satisfait de ma consultation. Le docteur a pris le temps de tout m\'expliquer.',
    'Personnel très agréable et médecin très pro. Je reviendrai sans hésiter.',
    'Parfait ! Ponctuel, attentionné et efficace. Merci pour cette prise en charge.'
  ],
  4: [
    'Bonne consultation, médecin attentif. Juste un peu d\'attente.',
    'Très bien dans l\'ensemble, je recommande ce praticien.',
    'Bon suivi médical, cabinet bien situé. Seul bémol : le parking.',
    'Médecin compétent et à l\'écoute. Accueil un peu froid mais soins excellents.'
  ],
  3: [
    'Consultation correcte mais un peu rapide à mon goût.',
    'Cabinet bien équipé mais temps d\'attente un peu long.',
    'Médecin compétent mais communication à améliorer.'
  ],
  2: [
    'Déçu par l\'attente, plus de 45 minutes de retard.',
    'Le médecin était pressé, je n\'ai pas pu poser toutes mes questions.'
  ],
  1: [
    'Très mauvaise expérience. Attente interminable et accueil désagréable.',
    'Je ne recommande pas. Manque de professionnalisme.'
  ]
};

/**
 * Generate random date within the last N days
 */
function randomDateWithinDays(days) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - Math.random() * days * 24 * 60 * 60 * 1000);
  return pastDate.toISOString();
}

/**
 * Generate random review
 */
function generateRandomReview(orgId, index) {
  // Weight ratings: more 4-5 stars than 1-2
  const ratingWeights = [1, 2, 5, 15, 25]; // weights for 1-5 stars
  const totalWeight = ratingWeights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let rating = 1;
  for (let i = 0; i < ratingWeights.length; i++) {
    random -= ratingWeights[i];
    if (random <= 0) {
      rating = i + 1;
      break;
    }
  }

  const author = SAMPLE_AUTHORS[index % SAMPLE_AUTHORS.length];
  const comments = SAMPLE_COMMENTS[rating];
  const comment = comments[Math.floor(Math.random() * comments.length)];
  
  // Reviewed date: random within last 90 days, with more recent reviews being more likely
  const daysAgo = Math.floor(Math.pow(Math.random(), 2) * 90); // Squared for recency bias
  const reviewedAt = randomDateWithinDays(daysAgo);
  
  // Status: mostly pending, some replied
  const statusRand = Math.random();
  let status = 'pending';
  let replyText = null;
  let replyStatus = 'none';
  
  if (statusRand > 0.6) {
    status = 'replied';
    replyStatus = 'sent';
    replyText = rating >= 4 
      ? 'Merci beaucoup pour votre avis positif ! Nous sommes ravis que votre consultation se soit bien passée.'
      : 'Merci pour votre retour. Nous prenons note de vos remarques et travaillons à améliorer nos services.';
  } else if (statusRand > 0.5) {
    status = 'ignored';
  }

  return {
    orgId,
    provider: 'google',
    providerLocationId: `place_${orgId.slice(0, 8)}`,
    providerReviewId: `google_review_${Date.now()}_${index}`,
    authorName: author,
    rating,
    comment,
    reviewedAt,
    status,
    replyText,
    replyStatus,
    tags: rating >= 4 ? ['satisfied', 'recommend'] : rating <= 2 ? ['complaint'] : []
  };
}

/**
 * Main seed function
 */
async function seed(orgId, count = 50) {
  console.log('🌱 Starting reviews seed...');
  console.log(`📦 Target org: ${orgId}`);
  console.log(`📊 Generating ${count} reviews...\n`);

  const reviews = [];
  for (let i = 0; i < count; i++) {
    reviews.push(generateRandomReview(orgId, i));
  }

  const result = reviewRepo.bulkInsert(orgId, reviews);
  
  console.log('✅ Seed completed!');
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Skipped (duplicates): ${result.skipped}`);
  
  // Show stats
  const stats = reviewRepo.getStats(orgId);
  console.log('\n📈 Review stats:');
  console.log(`   Total: ${stats.total}`);
  console.log(`   Average rating: ${stats.avgRating}`);
  console.log(`   Pending: ${stats.pendingCount}`);
  console.log(`   Replied: ${stats.repliedCount}`);
  console.log(`   Response rate: ${stats.responseRate}%`);
  console.log('\n⭐ Distribution:');
  stats.starDistribution.forEach(s => {
    const bar = '█'.repeat(Math.round(s.percentage / 5));
    console.log(`   ${s.stars}★ : ${bar} ${s.count} (${s.percentage}%)`);
  });
}

/**
 * Run the script
 */
async function main() {
  try {
    // Check SQLite mode
    if (process.env.USE_SQLITE !== '1') {
      console.error('❌ This script requires SQLite mode.');
      console.error('   Run with: USE_SQLITE=1 node lib/scripts/seed-reviews.js');
      process.exit(1);
    }

    // Get or detect orgId
    let orgId = process.argv[2];
    
    if (!orgId) {
      // Try to get first org from database
      const org = db.get('SELECT id FROM orgs LIMIT 1');
      if (org) {
        orgId = org.id;
        console.log(`🔍 Auto-detected org: ${orgId}`);
      } else {
        console.error('❌ No org found. Please provide an orgId or create an org first.');
        process.exit(1);
      }
    }

    // Verify org exists
    const org = db.get('SELECT id, name FROM orgs WHERE id = ?', [orgId]);
    if (!org) {
      console.error(`❌ Org not found: ${orgId}`);
      process.exit(1);
    }
    
    console.log(`📍 Org name: ${org.name || 'Unknown'}\n`);

    // Run migration if needed
    const tableExists = db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'");
    if (!tableExists) {
      console.log('📋 Running reviews migration...');
      const migrationSQL = require('fs').readFileSync(
        require('path').join(__dirname, '../migrations/004_add_reviews.sql'),
        'utf-8'
      );
      db.exec(migrationSQL);
      console.log('✅ Migration completed\n');
    }

    // Seed count from argument or default
    const count = parseInt(process.argv[3]) || 50;
    
    await seed(orgId, count);
    
    console.log('\n🎉 Done! You can now test the reviews API.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
