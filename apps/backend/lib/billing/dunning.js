/**
 * Dunning Module
 * 
 * Manages payment failure reminders and account restrictions.
 * 
 * Flow:
 * - J0: Payment fails → past_due + first reminder
 * - J3: Second reminder
 * - J6: Third (final) reminder
 * - J7: Account → read_only
 * 
 * State stored in org.options.dunning (options_json in SQLite)
 */

const logger = require('../logger');
const { STATES } = require('./state-machine');

// ============================================================
// Constants
// ============================================================

const DUNNING_STAGES = {
  NONE: 0,       // No dunning
  DAY_0: 1,      // First reminder (payment failed)
  DAY_3: 2,      // Second reminder
  DAY_6: 3,      // Third/final reminder
  READ_ONLY: 4   // Account restricted
};

const GRACE_PERIOD_DAYS = 7;

// Reminder schedule (days since pastDueSince)
const REMINDER_SCHEDULE = [
  { stage: DUNNING_STAGES.DAY_0, days: 0 },
  { stage: DUNNING_STAGES.DAY_3, days: 3 },
  { stage: DUNNING_STAGES.DAY_6, days: 6 }
];

// ============================================================
// Dunning State Management
// ============================================================

/**
 * Get dunning state from org
 * @param {object} org - Organization object
 * @returns {object} Dunning state
 */
function getDunningState(org) {
  const options = org.options || {};
  const dunning = options.dunning || {};
  
  return {
    stage: dunning.stage || DUNNING_STAGES.NONE,
    pastDueSince: dunning.pastDueSince || null,
    lastReminderSentAt: dunning.lastReminderSentAt || null,
    reminderCount: dunning.reminderCount || 0
  };
}

/**
 * Initialize dunning state when payment fails
 * @param {object} org - Organization object
 * @returns {object} Updated dunning state
 */
function initializeDunning(org) {
  const now = new Date().toISOString();
  
  const dunningState = {
    stage: DUNNING_STAGES.DAY_0,
    pastDueSince: now,
    lastReminderSentAt: null,
    reminderCount: 0
  };
  
  // Update org.options.dunning
  org.options = org.options || {};
  org.options.dunning = dunningState;
  
  logger.logAudit('DUNNING_INITIALIZED', {
    orgId: org.id,
    pastDueSince: now
  });
  
  return dunningState;
}

/**
 * Clear dunning state when payment succeeds
 * @param {object} org - Organization object
 */
function clearDunning(org) {
  if (org.options?.dunning) {
    const previousState = { ...org.options.dunning };
    
    org.options.dunning = {
      stage: DUNNING_STAGES.NONE,
      pastDueSince: null,
      lastReminderSentAt: null,
      reminderCount: 0
    };
    
    logger.logAudit('DUNNING_CLEARED', {
      orgId: org.id,
      previousState
    });
  }
}

/**
 * Calculate days since payment failure
 * @param {object} dunningState - Current dunning state
 * @returns {number} Days since pastDueSince
 */
function getDaysPastDue(dunningState) {
  if (!dunningState.pastDueSince) return 0;
  
  const pastDueDate = new Date(dunningState.pastDueSince);
  const now = new Date();
  const diffMs = now - pastDueDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Determine if read_only should be applied
 * @param {object} dunningState - Current dunning state
 * @returns {boolean}
 */
function shouldBeReadOnly(dunningState) {
  const daysPastDue = getDaysPastDue(dunningState);
  return daysPastDue >= GRACE_PERIOD_DAYS;
}

/**
 * Determine next reminder to send
 * @param {object} dunningState - Current dunning state
 * @returns {{shouldSend: boolean, stage: number, daysPastDue: number} | null}
 */
function getNextReminder(dunningState) {
  if (dunningState.stage === DUNNING_STAGES.NONE) {
    return null;
  }
  
  const daysPastDue = getDaysPastDue(dunningState);
  
  // Find the appropriate stage for current days
  let targetStage = DUNNING_STAGES.DAY_0;
  for (const schedule of REMINDER_SCHEDULE) {
    if (daysPastDue >= schedule.days) {
      targetStage = schedule.stage;
    }
  }
  
  // Check if we need to send a reminder for this stage
  if (targetStage > dunningState.stage) {
    return {
      shouldSend: true,
      stage: targetStage,
      daysPastDue
    };
  }
  
  return {
    shouldSend: false,
    stage: dunningState.stage,
    daysPastDue
  };
}

/**
 * Record that a reminder was sent
 * @param {object} org - Organization object
 * @param {number} stage - Dunning stage
 */
function recordReminderSent(org, stage) {
  const now = new Date().toISOString();
  
  org.options = org.options || {};
  org.options.dunning = org.options.dunning || {};
  org.options.dunning.stage = stage;
  org.options.dunning.lastReminderSentAt = now;
  org.options.dunning.reminderCount = (org.options.dunning.reminderCount || 0) + 1;
  
  logger.logAudit('DUNNING_REMINDER_SENT', {
    orgId: org.id,
    stage,
    reminderCount: org.options.dunning.reminderCount
  });
}

// ============================================================
// Dunning Processor
// ============================================================

/**
 * Process dunning for a single organization
 * @param {object} org - Organization object
 * @param {function} sendReminderFn - Function to send reminder email
 * @param {function} saveOrgFn - Function to save org updates
 * @returns {Promise<{action: string, details?: object}>}
 */
async function processDunning(org, sendReminderFn, saveOrgFn) {
  const dunningState = getDunningState(org);
  
  // No dunning active
  if (dunningState.stage === DUNNING_STAGES.NONE) {
    return { action: 'none' };
  }
  
  // Check for read_only transition
  if (shouldBeReadOnly(dunningState)) {
    // Update org status to read_only
    org.status = STATES.READ_ONLY;
    org.options = org.options || {};
    org.options.dunning = org.options.dunning || {};
    org.options.dunning.stage = DUNNING_STAGES.READ_ONLY;
    
    await saveOrgFn(org);
    
    logger.logAudit('DUNNING_READ_ONLY_APPLIED', {
      orgId: org.id,
      daysPastDue: getDaysPastDue(dunningState)
    });
    
    // Send final notification
    if (sendReminderFn) {
      try {
        await sendReminderFn(org, 'read_only');
      } catch (err) {
        logger.logError('DUNNING_EMAIL_ERROR', {
          orgId: org.id,
          type: 'read_only',
          error: err.message
        });
      }
    }
    
    return {
      action: 'read_only',
      details: { daysPastDue: getDaysPastDue(dunningState) }
    };
  }
  
  // Check for reminder
  const reminderCheck = getNextReminder(dunningState);
  
  if (reminderCheck?.shouldSend) {
    // Send reminder
    if (sendReminderFn) {
      try {
        await sendReminderFn(org, `reminder_day_${reminderCheck.daysPastDue}`);
      } catch (err) {
        logger.logError('DUNNING_EMAIL_ERROR', {
          orgId: org.id,
          type: `reminder_day_${reminderCheck.daysPastDue}`,
          error: err.message
        });
      }
    }
    
    // Update dunning state
    recordReminderSent(org, reminderCheck.stage);
    await saveOrgFn(org);
    
    return {
      action: 'reminder_sent',
      details: {
        stage: reminderCheck.stage,
        daysPastDue: reminderCheck.daysPastDue
      }
    };
  }
  
  return { action: 'none' };
}

/**
 * Process dunning for all past_due organizations
 * @param {Array} orgs - List of organizations with status 'past_due'
 * @param {function} sendReminderFn - Function to send reminder email
 * @param {function} saveOrgFn - Function to save org updates
 * @returns {Promise<{processed: number, reminders: number, readOnly: number}>}
 */
async function processAllDunning(orgs, sendReminderFn, saveOrgFn) {
  const results = {
    processed: 0,
    reminders: 0,
    readOnly: 0
  };
  
  for (const org of orgs) {
    if (org.status !== STATES.PAST_DUE && org.status !== 'past_due') {
      continue;
    }
    
    try {
      const result = await processDunning(org, sendReminderFn, saveOrgFn);
      results.processed++;
      
      if (result.action === 'reminder_sent') {
        results.reminders++;
      } else if (result.action === 'read_only') {
        results.readOnly++;
      }
    } catch (err) {
      logger.logError('DUNNING_PROCESS_ERROR', {
        orgId: org.id,
        error: err.message
      });
    }
  }
  
  logger.logAudit('DUNNING_BATCH_COMPLETE', results);
  
  return results;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Constants
  DUNNING_STAGES,
  GRACE_PERIOD_DAYS,
  REMINDER_SCHEDULE,
  
  // State management
  getDunningState,
  initializeDunning,
  clearDunning,
  getDaysPastDue,
  shouldBeReadOnly,
  getNextReminder,
  recordReminderSent,
  
  // Processing
  processDunning,
  processAllDunning
};
