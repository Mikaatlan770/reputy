/**
 * P0.4 - Email Provider Abstraction
 *
 * - "ses_smtp": SES via nodemailer SMTP (production)
 * - dry-run:   logs to console + returns fake messageId (dev/sandbox)
 *
 * Toggle: EMAIL_DRY_RUN=true (default) → dry-run
 *         EMAIL_DRY_RUN=false          → real SMTP send
 */

const nodemailer = require('nodemailer');
const logger = require('../logger');

// ============ CONFIG ============
const EMAIL_FROM = process.env.EMAIL_FROM || 'Reputy <no-reply@reputyapp.com>';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@reputyapp.com';
const EMAIL_DRY_RUN = (process.env.EMAIL_DRY_RUN || 'true').toLowerCase() === 'true';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'ses_smtp';

const SMTP_HOST = process.env.SMTP_HOST || 'email-smtp.eu-west-3.amazonaws.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// ============ TRANSPORT (lazy singleton) ============
let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  if (EMAIL_DRY_RUN) {
    // Dry-run transport: log only, no network
    _transport = {
      sendMail: async (opts) => {
        const fakeId = `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        logger.logInfo('EMAIL_DRY_RUN', 'Email NOT sent (dry-run)', {
          to: opts.to, subject: opts.subject, messageId: fakeId,
        });
        console.log('\n' + '='.repeat(60));
        console.log('📧 EMAIL DRY-RUN (non envoyé)');
        console.log('='.repeat(60));
        console.log(`De:      ${opts.from}`);
        console.log(`À:       ${opts.to}`);
        console.log(`Sujet:   ${opts.subject}`);
        console.log(`ReplyTo: ${opts.replyTo || '-'}`);
        console.log('-'.repeat(60));
        console.log((opts.text || '').substring(0, 500) || '(HTML only)');
        console.log('='.repeat(60) + '\n');
        return { messageId: fakeId, response: 'dry_run' };
      },
      verify: async () => true,
    };
    return _transport;
  }

  // Real SMTP (SES)
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error(
      '[EMAIL] SMTP_USER / SMTP_PASS manquants. Activez EMAIL_DRY_RUN=true ou configurez SMTP.'
    );
  }

  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 14, // SES production ~14/sec; sandbox ~1/sec
  });

  return _transport;
}

/**
 * Send one email
 * @param {{ to, subject, text, html, headers? }} opts
 * @returns {Promise<{ messageId: string, response: string }>}
 */
async function sendEmail({ to, subject, text, html, headers = {} }) {
  const transport = getTransport();

  const mailOptions = {
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
    replyTo: EMAIL_REPLY_TO,
    headers: { 'X-Mailer': 'Reputy/1.0', ...headers },
  };

  try {
    const result = await transport.sendMail(mailOptions);
    logger.logInfo('EMAIL_SENT', `Email sent to ${to}`, {
      messageId: result.messageId,
      provider: EMAIL_DRY_RUN ? 'dry_run' : EMAIL_PROVIDER,
    });
    return { messageId: result.messageId, response: result.response || 'ok' };
  } catch (err) {
    logger.logError('EMAIL_SEND_FAILED', `Failed to send email to ${to}`, {
      error: err.message, code: err.code,
      provider: EMAIL_DRY_RUN ? 'dry_run' : EMAIL_PROVIDER,
    });
    throw err;
  }
}

/**
 * Verify SMTP connection
 */
async function verifyConnection() {
  try {
    const transport = getTransport();
    if (transport.verify) await transport.verify();
    return { ok: true, provider: EMAIL_DRY_RUN ? 'dry_run' : EMAIL_PROVIDER };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendEmail,
  verifyConnection,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  EMAIL_DRY_RUN,
  EMAIL_PROVIDER,
};
