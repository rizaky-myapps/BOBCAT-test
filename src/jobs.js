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

/** Supprime les brouillons non envoyés créés il y a plus de 5h. */
async function deleteExpiredDrafts() {
  const { deletedCount } = await AtmDraft.deleteMany({ createdAt: { $lte: new Date(Date.now() - DRAFT_LIFETIME) } });
  if (deletedCount) console.log(`[Brouillons] ${deletedCount} brouillon(s) expiré(s) supprimé(s).`);
}

/** Lance une tâche immédiatement puis à intervalle régulier, en journalisant ses erreurs. */
function every(interval, name, task) {
  const run = () => task().catch((error) => console.error(`[${name}] Erreur :`, error));
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
}

module.exports = { startJobs, deleteExpiredDrafts };
