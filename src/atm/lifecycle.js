const AtmSession = require('../models/AtmSession');
const { CANCEL_NOT_STARTED, START_DEADLINE } = require('./constants');
const { refreshSessionPds } = require('./pds');
const { fetchRechercheChannel, moveToBasket, sessionLinkButton, syncSessionMessage } = require('./service');
const { closeStartCheck } = require('./startCheck');
const { toUnix } = require('../utils/date');
const { textMessage } = require('../utils/v2');

const AFTER = { returnDocument: 'after' };

/**
 * Annule une session pas encore commencée : statut « Annulée », liseré rouge, boutons désactivés.
 * @param {{ reason: string, details?: string|null, by?: string|null }} cancellation by = null : annulation automatique
 * @returns {Promise<object|null>} La session annulée, ou null si elle n'était plus « En attente ».
 */
async function cancelSession(client, sessionId, { reason, details = null, by = null }) {
  const session = await AtmSession.findOneAndUpdate(
    { _id: sessionId, status: 'pending' },
    { $set: { status: 'cancelled', cancellation: { reason, details, by, at: new Date() }, pendingDispatch: [] } },
    AFTER,
  );
  if (!session) return null;

  await syncSessionMessage(client, session);
  await closeStartCheck(
    client,
    session,
    by ? `❌ **Session annulée** par <@${by}>.` : '⌛ **Session non commencée dans les 10 minutes : annulée.**',
  );
  await moveToBasket(session);
  return session;
}

/** « Commencer » : statut « En cours... ». */
async function startSession(client, sessionId) {
  const session = await AtmSession.findOneAndUpdate(
    { _id: sessionId, status: 'pending' },
    { $set: { status: 'in_progress', startedAt: new Date(), pendingDispatch: [] } },
    AFTER,
  );
  if (!session) return null;

  await syncSessionMessage(client, session);
  await closeStartCheck(client, session, '▶️ **Session commencée.**');
  return session;
}

/** « Finir la session » : statut « Terminée », tous les boutons désactivés (✏️ des PDS compris). */
async function finishSession(client, sessionId) {
  const session = await AtmSession.findOneAndUpdate(
    { _id: sessionId, status: 'in_progress' },
    { $set: { status: 'done', endedAt: new Date() } },
    AFTER,
  );
  if (!session) return null;

  await syncSessionMessage(client, session);
  await refreshSessionPds(client, session);
  await moveToBasket(session);
  return session;
}

/** Déplace dans la corbeille les sessions annulées ou terminées restées dans Session-ATM (ex : anciennes données). */
async function moveClosedSessionsToBasket() {
  for (const session of await AtmSession.find({ status: { $in: ['cancelled', 'done'] } })) {
    await moveToBasket(session);
  }
}

/**
 * Prévient par un ping, dans le salon RECHERCHE ATM (à défaut celui de la session), les agents ayant voté
 * pour une session annulée.
 */
async function notifyVoters(client, session) {
  if (!session.available.length) return;
  const ts = toUnix(session.scheduledAt);
  const text = [
    '## ❌ Session ATM annulée',
    `La session prévue le <t:${ts}:d> à <t:${ts}:t> n'a pas commencé à temps : elle est annulée.`,
    '',
    session.available.map((userId) => `<@${userId}>`).join(' '),
  ].join('\n');

  try {
    const channel = await fetchRechercheChannel(client, session);
    await channel.send({
      ...textMessage(text, { buttons: [sessionLinkButton(session)] }),
      allowedMentions: { users: session.available.slice(0, 100) },
    });
  } catch (error) {
    console.error('[Sessions] Envoi du ping d’annulation impossible :', error);
  }
}

/** Sessions maintenues mais toujours pas commencées 10 min après : annulées (appelé régulièrement). */
async function cancelUnstartedSessions(client) {
  const late = await AtmSession.find({
    status: 'pending',
    'startCheck.status': 'maintained',
    'startCheck.maintainedAt': { $lte: new Date(Date.now() - START_DEADLINE) },
  });

  for (const session of late) {
    const cancelled = await cancelSession(client, session._id, { reason: CANCEL_NOT_STARTED.value });
    if (cancelled) await notifyVoters(client, cancelled);
  }
}

module.exports = { cancelSession, startSession, finishSession, cancelUnstartedSessions, moveClosedSessionsToBasket };
