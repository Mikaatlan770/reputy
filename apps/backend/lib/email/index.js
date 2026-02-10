/**
 * P0.4 + P0.5 + P0.6 + P0.7 + P0.8 - Email Module Barrel Export
 */
module.exports = {
  signer: require('./signer'),
  provider: require('./provider'),
  templates: require('./templates'),
  quotas: require('./quotas'),
  sesWebhooks: require('./ses-webhooks'),
  warmup: require('./warmup'),
  monitoring: require('./monitoring'),
  alerting: require('./alerting'),
};
