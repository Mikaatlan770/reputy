/**
 * OpenAI Provider — Reputy
 *
 * Shared module: provides callOpenAI() used by both
 * suggestReply (manual, interactive) and autoReply (cron, batch).
 *
 * Env:
 *   OPENAI_API_KEY            — required (guard at call-site, not at require-time)
 *   OPENAI_MODEL              — optional, default gpt-4o-mini (interactive)
 *   OPENAI_AUTO_REPLY_MODEL   — optional, default gpt-4.1-mini (auto-reply)
 */

'use strict';

const OpenAI = require('openai');

// ── Sensitive-content heuristic ──────────────────────────────

const SENSITIVE_KEYWORDS = [
  'diagnostic', 'maladie', 'cancer', 'décès', 'mort', 'suicide',
  'dépression', 'harcèlement', 'agression', 'plainte', 'procès',
  'avocat', 'tribunal', 'erreur médicale', 'faute', 'négligence',
  'infection', 'opération', 'chirurgie', 'urgence', 'sang',
  'drogue', 'alcool', 'toxicomanie', 'psychiatr', 'handicap',
];

function isSensitive(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Shared low-level call ────────────────────────────────────

/**
 * Internal: call OpenAI Chat Completions.
 * Shared by suggestReply (interactive) and autoReply (batch/cron).
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userMessage
 * @param {string} [opts.model]         — overrides env default
 * @param {number} [opts.maxTokens=350] — max output tokens
 * @param {number} [opts.temperature=0.7]
 * @returns {Promise<{ text: string, usage: object, model: string }>}
 */
async function callOpenAI({ systemPrompt, userMessage, model, maxTokens = 350, temperature = 0.7 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENAI_NOT_CONFIGURED');
    err.statusCode = 503;
    throw err;
  }

  const finalModel = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: finalModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature,
  });

  const text = (completion.choices?.[0]?.message?.content || '').trim();
  const usage = completion.usage || {};

  if (!text) {
    const err = new Error('OpenAI returned empty response');
    err.statusCode = 502;
    throw err;
  }

  return { text, usage, model: finalModel };
}

// ── System prompts ───────────────────────────────────────────

const SUGGEST_SYSTEM_PROMPT = `Tu es un assistant qui rédige des brouillons de réponse aux avis Google pour un professionnel de santé.

Règles strictes :
- Réponse courte (3-5 phrases max), polie et professionnelle.
- Ne JAMAIS confirmer un diagnostic, un traitement ou une prise en charge médicale.
- Ne JAMAIS citer de données personnelles (nom, date de naissance, numéro de dossier).
- Si l'avis mentionne un problème grave ou sensible, proposer de contacter le cabinet en privé.
- Ne pas utiliser d'émoji sauf si le ton le demande.
- Écrire en français sauf si une autre langue est explicitement demandée.
- Le texte doit pouvoir être publié tel quel sur Google après validation humaine.`;

const AUTO_REPLY_SYSTEM_PROMPT = `Tu es un assistant qui rédige des réponses aux avis Google pour un professionnel de santé.

Règles STRICTES :
- Réponse COURTE : 2 à 4 phrases maximum.
- Ton concis, professionnel, structuré. Pas de blabla marketing.
- Structure : (1) Remerciement + reconnaissance, (2) Engagement qualité/suivi, (3) Invitation neutre si pertinent.
- TOUJOURS en français, vouvoiement.
- Ne JAMAIS confirmer ou évoquer un diagnostic, traitement, consultation spécifique, date de visite.
- Ne JAMAIS citer de données personnelles.
- Ne JAMAIS demander explicitement un nouvel avis ou une recommandation.
- Réponse générique et respectueuse, publiable telle quelle sur Google.
- Pas d'émoji.`;

// ── suggestReply (manual/interactive — existing) ─────────────

/**
 * Generate a draft reply for a Google review (interactive usage).
 *
 * @param {object} opts
 * @param {string} opts.reviewText  — the review content (public, already on Google)
 * @param {string} [opts.orgName]   — organisation display name (for personalisation)
 * @param {string} [opts.language]  — reply language (default: 'fr')
 * @param {string} [opts.tone]      — 'professional' | 'warm' | 'empathetic' | 'short'
 * @returns {Promise<{ draft: string, sensitive: boolean }>}
 */
async function suggestReply({ reviewText, orgName, language = 'fr', tone = 'professional' }) {
  const sensitive = isSensitive(reviewText);

  const toneInstruction = {
    professional: 'Ton professionnel et courtois.',
    warm: 'Ton chaleureux et bienveillant.',
    empathetic: 'Ton empathique et compréhensif.',
    short: 'Réponse très courte (2 phrases max).',
  }[tone] || 'Ton professionnel et courtois.';

  const userMessage = [
    `Avis Google à traiter :`,
    `"${reviewText}"`,
    '',
    toneInstruction,
    orgName ? `Nom du cabinet : ${orgName}` : '',
    language !== 'fr' ? `Langue de réponse : ${language}` : '',
    sensitive ? 'ATTENTION : contenu potentiellement sensible. Proposer un échange privé.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callOpenAI({
    systemPrompt: SUGGEST_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 350,
    temperature: 0.7,
  });

  return { draft: result.text, sensitive };
}

// ── autoReply (cron/batch — new) ─────────────────────────────

/**
 * Generate an auto-reply for a positive review (4-5★).
 * Uses stricter token budget and lower temperature for consistency.
 *
 * @param {object} opts
 * @param {string} opts.reviewText  — cleaned/truncated review text
 * @param {number} opts.rating      — 4 or 5
 * @param {string} [opts.orgName]   — cabinet name
 * @returns {Promise<{ draft: string, model: string, inputTokensEst: number, outputTokensEst: number }>}
 */
async function autoReply({ reviewText, rating, orgName }) {
  const userMessage = [
    `Avis Google (${rating}★) :`,
    `"${reviewText}"`,
    '',
    orgName ? `Cabinet : ${orgName}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const model = process.env.OPENAI_AUTO_REPLY_MODEL || 'gpt-4.1-mini';

  const result = await callOpenAI({
    systemPrompt: AUTO_REPLY_SYSTEM_PROMPT,
    userMessage,
    model,
    maxTokens: 300,
    temperature: 0.4,
  });

  return {
    draft: result.text,
    model: result.model,
    inputTokensEst: result.usage.prompt_tokens || 0,
    outputTokensEst: result.usage.completion_tokens || 0,
  };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  callOpenAI,
  suggestReply,
  autoReply,
  isSensitive,
  AUTO_REPLY_SYSTEM_PROMPT,
  SUGGEST_SYSTEM_PROMPT,
};
