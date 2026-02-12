/**
 * Repository Index
 * 
 * Central export for all repositories
 */

const orgRepo = require('./org.repo');
const userRepo = require('./user.repo');
const sessionRepo = require('./session.repo');
const requestRepo = require('./request.repo');
const feedbackRepo = require('./feedback.repo');
const messageRepo = require('./message.repo');
const usageRepo = require('./usage.repo');
const telemetryRepo = require('./telemetry.repo');
const emailVerificationRepo = require('./email-verification.repo');
const installationRepo = require('./installation.repo');
const shortlinkRepo = require('./shortlink.repo');
const reviewRepo = require('./review.repo');
const emailOutboxRepo = require('./email-outbox.repo');
const mrrSnapshotRepo = require('./mrr-snapshots.repo');
const membershipRepo = require('./membership.repo');

module.exports = {
  org: orgRepo,
  user: userRepo,
  session: sessionRepo,
  request: requestRepo,
  feedback: feedbackRepo,
  message: messageRepo,
  usage: usageRepo,
  telemetry: telemetryRepo,
  emailVerification: emailVerificationRepo,
  installation: installationRepo,
  shortlink: shortlinkRepo,
  review: reviewRepo,
  emailOutbox: emailOutboxRepo,
  mrrSnapshot: mrrSnapshotRepo,
  membership: membershipRepo
};
