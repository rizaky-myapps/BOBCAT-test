const AtmDraft = require('./models/AtmDraft');
const {
  DRAFT_CLEANUP_INTERVAL,
  DRAFT_LIFETIME,
  SUPERVISOR_CHECK_INTERVAL,
} = require('./atm/constants');
const { expirePendingRequests } = require('./atm/supervision');

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

/** Tâches de fond : brouillons expirés (toutes les 10 min) et demandes de supervision sans réponse. */
function startJobs(client) {
  every(DRAFT_CLEANUP_INTERVAL, 'Brouillons', deleteExpiredDrafts);
  every(SUPERVISOR_CHECK_INTERVAL, 'Supervision', () => expirePendingRequests(client));
}

module.exports = { startJobs, deleteExpiredDrafts };
