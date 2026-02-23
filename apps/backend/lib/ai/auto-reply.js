/**
 * Auto-Reply Logic — Reputy
 *
 * Eligibility checks, input preparation, and no-comment templates.
 * Used by the process-auto-replies.js cron worker.
 *
 * Rules:
 *   - Only 4★ and 5★ reviews are eligible
 *   - Reviews with reply_status != 'none' are skipped (incl. 'draft')
 *   - Reviews without comment get a template (zero AI cost)
 *   - Reviews with comment are cleaned + truncated to ~600 tokens
 */

'use strict';

// ── Config ───────────────────────────────────────────────────

const MAX_INPUT_TOKENS = 600;
const CHARS_PER_TOKEN = 4; // conservative approximation
const MAX_INPUT_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN; // ~2400

// ── Templates for no-comment reviews (zero AI cost) ──────────
// 5★: remerciement + engagement (très court)
// 4★: remerciement + ouverture "si vous souhaitez nous dire…" (neutre)

const NO_COMMENT_TEMPLATES = {
  5: [
    'Merci beaucoup pour cette excellente note. Votre confiance nous honore et nous motive à maintenir ce niveau de qualité.',
    'Nous vous remercions pour cette évaluation. Votre satisfaction est notre priorité, et nous restons à votre disposition.',
    'Merci pour cette note. Au plaisir de vous accueillir à nouveau.',
  ],
  4: [
    'Merci pour votre retour positif. Si vous souhaitez nous faire part de pistes d\'amélioration, nous sommes à votre écoute.',
    'Nous vous remercions pour cette évaluation. N\'hésitez pas à nous contacter si vous avez des suggestions pour améliorer votre expérience.',
  ],
};

/**
 * Get a template reply for reviews without comment.
 * Rotates templates to avoid identical consecutive replies.
 *
 * @param {number} rating — 4 or 5
 * @returns {string|null} Template text, or null if no template available
 */
function getNoCommentTemplate(rating) {
  const templates = NO_COMMENT_TEMPLATES[rating];
  if (!templates || templates.length === 0) return null;
  // Rotate based on current minute to vary responses
  const idx = new Date().getMinutes() % templates.length;
  return templates[idx];
}

// ── Eligibility ──────────────────────────────────────────────

/**
 * Check if a review is eligible for auto-reply.
 *
 * @param {object} review — Review object from DB (camelCase keys)
 * @returns {{ eligible: boolean, reason?: string, useTemplate?: boolean }}
 */
function shouldAutoReply(review) {
  if (!review) {
    return { eligible: false, reason: 'no_review' };
  }

  // Only 4★ and 5★
  if (review.rating < 4) {
    return { eligible: false, reason: 'rating_too_low' };
  }

  // Skip if any reply already exists (none, draft, queued, sent, failed)
  // We only auto-reply if reply_status is strictly 'none' or null
  if (review.replyStatus && review.replyStatus !== 'none') {
    return { eligible: false, reason: 'reply_already_exists' };
  }

  // Skip if reply text already written (e.g. manual draft)
  if (review.replyText) {
    return { eligible: false, reason: 'reply_text_exists' };
  }

  // No comment or very short comment → use template (0€ IA)
  if (!review.comment || review.comment.trim().length < 3) {
    return { eligible: true, useTemplate: true, reason: 'no_comment_template' };
  }

  return { eligible: true, useTemplate: false };
}

// ── Input Preparation ────────────────────────────────────────

/**
 * Clean and truncate review text to fit ~600 tokens budget.
 * Keeps beginning (70%) + end (25%) with [...] in middle.
 *
 * @param {string} text — Raw review text
 * @returns {{ cleaned: string, truncated: boolean, estimatedTokens: number }}
 */
function prepareAiInput(text) {
  if (!text) return { cleaned: '', truncated: false, estimatedTokens: 0 };

  let cleaned = text;

  // 1. Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S{1,2000}/gi, '[lien]');

  // 2. Remove email addresses
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[email]');

  // 3. Collapse whitespace / newlines
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 4. Remove common signatures
  cleaned = cleaned.replace(/^(cordialement|bien à vous|merci d'avance|cdlt)[,.\s]*$/gim, '');
  cleaned = cleaned.trim();

  // 5. Truncate if too long: keep 70% beginning + 25% end
  let truncated = false;
  if (cleaned.length > MAX_INPUT_CHARS) {
    const keepStart = Math.floor(MAX_INPUT_CHARS * 0.7);
    const keepEnd = Math.floor(MAX_INPUT_CHARS * 0.25);
    const start = cleaned.substring(0, keepStart);
    const end = cleaned.substring(cleaned.length - keepEnd);
    cleaned = start + ' [...] ' + end;
    truncated = true;
  }

  const estimatedTokens = Math.ceil(cleaned.length / CHARS_PER_TOKEN);
  return { cleaned, truncated, estimatedTokens };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  shouldAutoReply,
  prepareAiInput,
  getNoCommentTemplate,
  MAX_INPUT_TOKENS,
  MAX_INPUT_CHARS,
  CHARS_PER_TOKEN,
  NO_COMMENT_TEMPLATES,
};
