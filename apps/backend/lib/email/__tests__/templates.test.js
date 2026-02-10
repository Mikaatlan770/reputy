#!/usr/bin/env node
/**
 * P0.4 - Unit tests for email templates
 * Usage: node lib/email/__tests__/templates.test.js
 */

const templates = require('../templates');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else           { console.error(`  ❌ ${name}`); failed++; }
}

console.log('🧪 Template Tests\n');

// 1: review_request with patient name
{
  const r = templates.reviewRequest({
    orgName: 'Cabinet Dupont',
    patientFirstName: 'Marie',
    reviewUrl: 'https://example.com/r/review?token=abc',
    unsubscribeUrl: 'https://example.com/r/unsubscribe?token=xyz',
  });
  assert(typeof r.subject === 'string', 'subject is string');
  assert(r.subject.includes('Cabinet Dupont'), 'subject has org name');
  assert(r.text.includes('Marie'), 'text has patient name');
  assert(r.text.includes('Cabinet Dupont'), 'text has org name');
  assert(r.text.includes('https://example.com/r/review'), 'text has review URL');
  assert(r.text.includes('https://example.com/r/unsubscribe'), 'text has unsub URL');
  assert(r.html.includes('Donner mon avis'), 'html has CTA');
  assert(r.html.includes('Se désinscrire'), 'html has unsub link');
}

// 2: review_request without patient name
{
  const r = templates.reviewRequest({
    orgName: 'Dr Martin',
    patientFirstName: null,
    reviewUrl: 'https://x.com/r',
    unsubscribeUrl: 'https://x.com/u',
  });
  assert(r.text.startsWith('Bonjour,'), 'text starts with "Bonjour," (no name)');
  assert(r.html.includes('Bonjour,'), 'html has "Bonjour," (no name)');
}

// 3: test template
{
  const r = templates.testEmail({ orgName: 'TestOrg', targetEmail: 'admin@test.com' });
  assert(r.subject.includes('[TEST]'), 'subject has [TEST]');
  assert(r.text.includes('TestOrg'), 'text has org name');
  assert(r.html.includes('admin@test.com'), 'html has email');
}

// 4: renderTemplate registry
{
  const r = templates.renderTemplate('review_request', {
    orgName: 'O', patientFirstName: 'A', reviewUrl: '#', unsubscribeUrl: '#',
  });
  assert(r.subject.length > 0, 'renderTemplate works for review_request');

  let threw = false;
  try { templates.renderTemplate('nonexistent', {}); }
  catch (e) { threw = e.message.includes('Unknown'); }
  assert(threw, 'renderTemplate throws for unknown template');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
