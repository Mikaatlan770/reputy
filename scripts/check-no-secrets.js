#!/usr/bin/env node

/**
 * P0.1 — Guard script: check-no-secrets.js
 * 
 * Vérifie qu'aucun fichier sensible n'est traqué par git.
 * Fait échouer le process (exit 1) si un fichier interdit est détecté.
 * 
 * Usage:
 *   node scripts/check-no-secrets.js
 *   npm run guard:secrets
 * 
 * Brancher dans CI/CD ou en pre-commit hook.
 */

const { execSync } = require('child_process');
const path = require('path');

// ============================================================
// CONFIGURATION: Patterns interdits dans le tracking git
// ============================================================

const FORBIDDEN_PATTERNS = [
  // Bases de données SQLite (PII patients, billing, tokens)
  /\.db$/,
  /\.db-wal$/,
  /\.db-shm$/,
  /\.sqlite$/,
  /\.sqlite3$/,

  // Fichiers d'environnement (sauf .env.example)
  /\/\.env$/,
  /\/\.env\.local$/,
  /\/\.env\.production$/,
  /\/\.env\.staging$/,

  // Données legacy avec PII
  /apps\/backend\/data\.json$/,

  // Scripts de debug avec IDs hardcodés
  /apps\/backend\/debug-org\.js$/,
  /apps\/backend\/check-org-billing\.js$/,

  // Archives potentiellement sensibles
  /\.zip$/,
];

// Fichiers autorisés malgré les patterns (whitelist)
const ALLOWED_FILES = [
  '.env.example',
  'apps/backend/.env.example',
  'apps/backend/env.example',
];

// ============================================================
// EXÉCUTION
// ============================================================

function main() {
  console.log('🔍 P0.1 Guard: Vérification des fichiers sensibles dans git...\n');

  let trackedFiles;
  try {
    trackedFiles = execSync('git ls-files --cached', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    console.error('❌ Impossible d\'exécuter git ls-files. Êtes-vous dans un repo git ?');
    process.exit(2);
  }

  const violations = [];

  for (const file of trackedFiles) {
    // Vérifier si le fichier est dans la whitelist
    const isAllowed = ALLOWED_FILES.some(allowed => 
      file === allowed || file.endsWith('/' + allowed)
    );
    if (isAllowed) continue;

    // Vérifier contre chaque pattern interdit
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(file)) {
        violations.push({ file, pattern: pattern.source });
        break; // Un seul match suffit
      }
    }
  }

  // ============================================================
  // RÉSULTAT
  // ============================================================

  if (violations.length === 0) {
    console.log('✅ Aucun fichier sensible détecté dans le tracking git.');
    console.log(`   (${trackedFiles.length} fichiers vérifiés)\n`);
    process.exit(0);
  }

  console.error('🚨 VIOLATION P0.1: Fichiers sensibles détectés dans git !\n');
  console.error('   Les fichiers suivants ne doivent PAS être traqués par git:\n');

  for (const v of violations) {
    console.error(`   ❌ ${v.file}`);
    console.error(`      (pattern: ${v.pattern})\n`);
  }

  console.error('📋 Pour corriger:');
  console.error('   git rm --cached <fichier>');
  console.error('   Puis vérifiez que .gitignore contient les bons patterns.\n');
  
  process.exit(1);
}

main();
