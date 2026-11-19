const AtmDraft = require('./models/AtmDraft');
const {
  DRAFT_CLEANUP_INTERVAL,
  DRAFT_LIFETIME,
  SUPERVISOR_CHECK_INTERVAL,
  SUPERVISOR_ROLE_CHECK_INTERVAL,
  SESSION_CHECK_INTERVAL,
} = require('./atm/constants');
const { cancelUnstartedSessions, moveClosedSessionsToBasket } = require('./atm/lifecycle');
const { publishProgrammedSessions, sendProgramReminders } = require('./atm/programmed');
const { checkDispatchDeadlines, sendDispatchReminders } = require('./atm/reminders');
const { sendStartChecks } = require('./atm/startCheck');
const { expirePendingRequests } = require('./atm/supervision');
const { checkSupervisorRoles } = require('./atm/supervisorRoles');
const { isDatabaseConnected, isNetworkError } = require('./database/mongoose');
const { scheduleSeparators } = require('./gestion/separatorJob');
const { logAction } = require('./utils/logger');

/** Supprime les brouillons non envoyés créés il y a plus de 5h. */
async function deleteExpiredDrafts() {
  const { deletedCount } = await AtmDraft.deleteMany({ createdAt: { $lte: new Date(Date.now() - DRAFT_LIFETIME) } });
  if (deletedCount) logAction('BDD', `Suppression dans Session-ATM-Draft : ${deletedCount} brouillon(s) non envoyé(s) depuis 5h`);
}

/**
 * Lance une tâche immédiatement puis à intervalle régulier, en journalisant ses erreurs.
 * Base injoignable : la tâche est sautée et reprend au passage suivant, une fois reconnectée.
 */
function every(interval, name, task) {
  const run = () => {
    if (!isDatabaseConnected()) return;
    task().catch((error) => {
      if (isNetworkError(error)) console.warn(`[${name}] Base de données injoignable : ${error.message}`);
      else console.error(`[${name}] Erreur :`, error);
    });
  };
  run();
  return setInterval(run, interval);
}

/**
 * Tâches de fond : brouillons expirés (toutes les 10 min), demandes de supervision sans réponse,
 * superviseurs ayant perdu le rôle CO ATM (retirés après 1h), dispatching (30 min avant l'heure prévue),
 * rappel aux agents dispatchés (15 min avant), sessions non commencées (question au CO-ATM 30 min après
 * l'heure prévue, annulation 10 min après « Maintenu »).
 */
function startJobs(client) {
  every(DRAFT_CLEANUP_INTERVAL, 'Brouillons', deleteExpiredDrafts);
  every(DRAFT_CLEANUP_INTERVAL, 'Corbeille', moveClosedSessionsToBasket);
  every(SUPERVISOR_CHECK_INTERVAL, 'Supervision', () => expirePendingRequests(client));
  every(SUPERVISOR_ROLE_CHECK_INTERVAL, 'Superviseurs', () => checkSupervisorRoles(client));
  every(SESSION_CHECK_INTERVAL, 'Sessions', async () => {
    await sendProgramReminders(client);
    await publishProgrammedSessions(client);
    await checkDispatchDeadlines(client);
    await sendDispatchReminders(client);
    await sendStartChecks(client);
    await cancelUnstartedSessions(client);
  });
  // Séparateurs (/gestion) : tous les dimanches à 23:59:59.
  scheduleSeparators(client);
}

module.exports = { startJobs, deleteExpiredDrafts };
