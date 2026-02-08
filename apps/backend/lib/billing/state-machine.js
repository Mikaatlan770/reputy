/**
 * Subscription State Machine
 * 
 * Manages subscription lifecycle states:
 * - trial: Free trial period
 * - active: Paid and active
 * - past_due: Payment failed, grace period
 * - suspended: Account suspended (after grace period)
 * - cancelled: Subscription cancelled
 * - read_only: Can view but not use features
 * 
 * State transitions:
 * trial → active (payment successful)
 * active → past_due (payment failed)
 * past_due → active (payment successful)
 * past_due → suspended (grace period expired)
 * suspended → active (payment successful)
 * any → cancelled (user cancels)
 * suspended → read_only (long term suspension)
 */

// ============================================================
// Constants
// ============================================================

const STATES = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  READ_ONLY: 'read_only'
};

// Grace period in days before suspension
const GRACE_PERIOD_DAYS = 7;

// Days after suspension before read_only
const SUSPENSION_TO_READ_ONLY_DAYS = 30;

// ============================================================
// State Permissions
// ============================================================

const STATE_PERMISSIONS = {
  [STATES.TRIAL]: {
    canSendSms: true,
    canSendEmail: true,
    canUseAi: true,
    canCreateShortlinks: true,
    canViewDashboard: true,
    canManageSettings: true,
    isRestricted: false
  },
  [STATES.ACTIVE]: {
    canSendSms: true,
    canSendEmail: true,
    canUseAi: true,
    canCreateShortlinks: true,
    canViewDashboard: true,
    canManageSettings: true,
    isRestricted: false
  },
  [STATES.PAST_DUE]: {
    canSendSms: true,  // Still allowed during grace period
    canSendEmail: true,
    canUseAi: true,
    canCreateShortlinks: true,
    canViewDashboard: true,
    canManageSettings: true,
    isRestricted: false,
    warningMessage: 'Paiement en attente - Mettez à jour vos informations de paiement'
  },
  [STATES.SUSPENDED]: {
    canSendSms: false,
    canSendEmail: false,
    canUseAi: false,
    canCreateShortlinks: false,
    canViewDashboard: true,
    canManageSettings: true,
    isRestricted: true,
    blockMessage: 'Compte suspendu - Régularisez votre situation pour continuer'
  },
  [STATES.CANCELLED]: {
    canSendSms: false,
    canSendEmail: false,
    canUseAi: false,
    canCreateShortlinks: false,
    canViewDashboard: true,
    canManageSettings: false,
    isRestricted: true,
    blockMessage: 'Abonnement résilié - Réactivez votre compte pour continuer'
  },
  [STATES.READ_ONLY]: {
    canSendSms: false,
    canSendEmail: false,
    canUseAi: false,
    canCreateShortlinks: false,
    canViewDashboard: true,
    canManageSettings: false,
    isRestricted: true,
    blockMessage: 'Compte en lecture seule - Contactez le support'
  }
};

// ============================================================
// State Transition Functions
// ============================================================

/**
 * Get current subscription state from org
 * @param {object} org - Organization object
 * @returns {string} Current state
 */
function getCurrentState(org) {
  if (!org) return STATES.SUSPENDED;
  
  // Check explicit status field first
  const status = org.status || 'active';
  
  // Map org status to state
  const statusToState = {
    active: STATES.ACTIVE,
    trial: STATES.TRIAL,
    past_due: STATES.PAST_DUE,
    suspended: STATES.SUSPENDED,
    cancelled: STATES.CANCELLED,
    read_only: STATES.READ_ONLY
  };
  
  return statusToState[status] || STATES.ACTIVE;
}

/**
 * Get permissions for current state
 * @param {string} state - State key
 * @returns {object} Permissions object
 */
function getPermissions(state) {
  return STATE_PERMISSIONS[state] || STATE_PERMISSIONS[STATES.SUSPENDED];
}

/**
 * Check if org can perform an action
 * @param {object} org - Organization object
 * @param {string} action - Action to check ('sendSms', 'sendEmail', etc.)
 * @returns {{ allowed: boolean, error?: object }}
 */
function canPerformAction(org, action) {
  const state = getCurrentState(org);
  const permissions = getPermissions(state);
  
  const actionToPermission = {
    sendSms: 'canSendSms',
    sendEmail: 'canSendEmail',
    useAi: 'canUseAi',
    createShortlink: 'canCreateShortlinks',
    viewDashboard: 'canViewDashboard',
    manageSettings: 'canManageSettings'
  };
  
  const permissionKey = actionToPermission[action];
  if (!permissionKey) {
    return { allowed: false, error: { message: 'Action inconnue' } };
  }
  
  const allowed = permissions[permissionKey];
  
  if (!allowed) {
    const { createError } = require('../errors');
    let errorCategory;
    
    switch (state) {
      case STATES.PAST_DUE:
        errorCategory = 'SUBSCRIPTION_PAST_DUE';
        break;
      case STATES.SUSPENDED:
        errorCategory = 'SUBSCRIPTION_SUSPENDED';
        break;
      case STATES.CANCELLED:
        errorCategory = 'SUBSCRIPTION_CANCELLED';
        break;
      case STATES.READ_ONLY:
        errorCategory = 'SUBSCRIPTION_READ_ONLY';
        break;
      default:
        errorCategory = 'SUBSCRIPTION_INACTIVE';
    }
    
    return {
      allowed: false,
      error: createError(errorCategory, {
        details: {
          currentState: state,
          action,
          message: permissions.blockMessage
        }
      })
    };
  }
  
  return {
    allowed: true,
    warning: permissions.warningMessage
  };
}

/**
 * Transition org to new state
 * @param {object} org - Organization object
 * @param {string} newState - Target state
 * @param {object} options - Transition options
 * @returns {{ success: boolean, previousState: string, newState: string }}
 */
function transitionTo(org, newState, options = {}) {
  const previousState = getCurrentState(org);
  
  // Validate transition
  const validTransitions = {
    [STATES.TRIAL]: [STATES.ACTIVE, STATES.CANCELLED],
    [STATES.ACTIVE]: [STATES.PAST_DUE, STATES.CANCELLED],
    [STATES.PAST_DUE]: [STATES.ACTIVE, STATES.SUSPENDED, STATES.CANCELLED],
    [STATES.SUSPENDED]: [STATES.ACTIVE, STATES.READ_ONLY, STATES.CANCELLED],
    [STATES.READ_ONLY]: [STATES.ACTIVE, STATES.CANCELLED],
    [STATES.CANCELLED]: [STATES.ACTIVE] // Reactivation
  };
  
  const allowed = validTransitions[previousState]?.includes(newState);
  
  if (!allowed && !options.force) {
    console.warn(`[STATE-MACHINE] Invalid transition: ${previousState} → ${newState}`);
    return {
      success: false,
      previousState,
      newState: previousState,
      error: `Transition non autorisée: ${previousState} → ${newState}`
    };
  }
  
  // Log transition
  console.log(`[STATE-MACHINE] Transition: ${previousState} → ${newState} for org ${org.id}`);
  
  return {
    success: true,
    previousState,
    newState,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if grace period has expired for past_due orgs
 * @param {object} org - Organization object
 * @returns {{ expired: boolean, daysRemaining: number }}
 */
function checkGracePeriod(org) {
  if (getCurrentState(org) !== STATES.PAST_DUE) {
    return { expired: false, daysRemaining: -1 };
  }
  
  const plan = org.plan || {};
  const pastDueSince = plan.pastDueSince ? new Date(plan.pastDueSince) : new Date();
  const now = new Date();
  const daysSincePastDue = Math.floor((now - pastDueSince) / (1000 * 60 * 60 * 24));
  const daysRemaining = GRACE_PERIOD_DAYS - daysSincePastDue;
  
  return {
    expired: daysRemaining <= 0,
    daysRemaining: Math.max(0, daysRemaining),
    daysSincePastDue
  };
}

/**
 * Get state info for UI display
 * @param {object} org - Organization object
 * @returns {object} State info with UI-friendly data
 */
function getStateInfo(org) {
  const state = getCurrentState(org);
  const permissions = getPermissions(state);
  const graceCheck = state === STATES.PAST_DUE ? checkGracePeriod(org) : null;
  
  return {
    state,
    stateLabel: getStateLabel(state),
    permissions,
    isRestricted: permissions.isRestricted,
    warningMessage: permissions.warningMessage,
    blockMessage: permissions.blockMessage,
    gracePeriod: graceCheck
  };
}

/**
 * Get human-readable state label
 * @param {string} state - State key
 * @returns {string} French label
 */
function getStateLabel(state) {
  const labels = {
    [STATES.TRIAL]: 'Essai gratuit',
    [STATES.ACTIVE]: 'Actif',
    [STATES.PAST_DUE]: 'Paiement en attente',
    [STATES.SUSPENDED]: 'Suspendu',
    [STATES.CANCELLED]: 'Résilié',
    [STATES.READ_ONLY]: 'Lecture seule'
  };
  return labels[state] || 'Inconnu';
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Constants
  STATES,
  GRACE_PERIOD_DAYS,
  SUSPENSION_TO_READ_ONLY_DAYS,
  STATE_PERMISSIONS,
  
  // Functions
  getCurrentState,
  getPermissions,
  canPerformAction,
  transitionTo,
  checkGracePeriod,
  getStateInfo,
  getStateLabel
};
