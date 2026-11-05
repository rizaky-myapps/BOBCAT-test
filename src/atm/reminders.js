const AtmSession = require('../models/AtmSession');
const { CANCEL_NO_AGENTS, DISPATCH_CHECK_BEFORE, DISPATCH_REMINDER_BEFORE } = require('./constants');
const { cancelSession } = require('./lifecycle');
const { getMinAgents, sessionUrl } = require('./service');
const { fetchCoAtmChannel } = require('./supervision');
const { toUnix } = require('../utils/date');
const { textMessage } = require('../utils/v2');

const AFTER = { returnDocument: 'after' };

/** Ping du CO-ATM dans le salon CO-ATM : sa session n'est pas encore dispatchée. */
async function pingCoAtmForDispatch(client, session) {
  const ts = toUnix(session.scheduledAt);
  const message = textMessage(
    [
      '## 📋 Session ATM à dispatcher',
      `<@${session.creatorId}>, ta session prévue à <t:${ts}:t> (<t:${ts}:R>) n'est pas encore dispatchée : ${session.available.length} agent(s) disponible(s).`,
      'Fais ton dispatch avec le bouton ⚙️ de la session → « Dispatching ».',
      `> [Voir la session](${sessionUrl(session)})`,
    ].join('\n'),
  );
  const channel = await fetchCoAtmChannel(client);
  await channel.send({ ...message, allowedMentions: { users: [session.creatorId] } });
}

/** Message (sans mention) dans le salon CO-ATM : la session est annulée faute d'agents. */
async function notifyNoAgents(client, session) {
  const ts = toUnix(session.scheduledAt);
  const channel = await fetchCoAtmChannel(client);
  await channel.send(
    textMessage(
      [
        "## ❌ Session ATM annulée : manque d'agents",
        `La session de <@${session.creatorId}> prévue le <t:${ts}:d> à <t:${ts}:t> est annulée : pas assez d'agents disponibles.`,
        `> [Voir la session](${sessionUrl(session)})`,
      ].join('\n'),
    ),
  );
}

/**
 * 30 min avant l'heure prévue, pour une session en attente pas encore dispatchée (appelé régulièrement) :
 * - assez d'agents disponibles pour commencer → le CO-ATM est pingé dans le salon CO-ATM pour faire son dispatch ;
 * - sinon → la session est annulée (manque d'agents) avec un message sans mention dans le salon CO-ATM.
 * Les sessions postées moins de 30 min avant leur heure ne sont pas concernées.
 */
async function checkDispatchDeadlines(client) {
  const now = Date.now();
  const due = await AtmSession.find({
    status: 'pending',
    dispatchCheckedAt: null,
    scheduledAt: { $lte: new Date(now + DISPATCH_CHECK_BEFORE) },
  });

  for (const candidate of due) {
    if (!candidate.messageId) continue;
    // Réservation atomique : la vérification n'est faite qu'une fois.
    const session = await AtmSession.findOneAndUpdate(
      { _id: candidate._id, status: 'pending', dispatchCheckedAt: null },
      { $set: { dispatchCheckedAt: new Date() } },
      AFTER,
    );
    if (!session) continue;

    const checkTime = session.scheduledAt.getTime() - DISPATCH_CHECK_BEFORE;
    const postedLate = session.createdAt && session.createdAt.getTime() > checkTime;
    if (session.dispatchedAt || postedLate || session.scheduledAt.getTime() <= now) continue;

    try {
      if (session.available.length >= getMinAgents(session)) {
        await pingCoAtmForDispatch(client, session);
      } else {
        const cancelled = await cancelSession(client, session._id, { reason: CANCEL_NO_AGENTS.value });
        if (cancelled) await notifyNoAgents(client, cancelled);
      }
    } catch (error) {
      console.error('[Sessions] Vérification du dispatching impossible :', error);
    }
  }
}

/** 15 min avant l'heure prévue : rappel (ping) aux agents dispatchés dans le salon des sessions. */
async function sendDispatchReminders(client) {
  const now = Date.now();
  const due = await AtmSession.find({
    status: 'pending',
    dispatchedAt: { $ne: null },
    reminderSentAt: null,
    scheduledAt: { $lte: new Date(now + DISPATCH_REMINDER_BEFORE) },
  });

  for (const candidate of due) {
    const session = await AtmSession.findOneAndUpdate(
      { _id: candidate._id, status: 'pending', reminderSentAt: null },
      { $set: { reminderSentAt: new Date() } },
      AFTER,
    );
    if (!session || session.scheduledAt.getTime() <= now) continue;

    // Agents du dispatch (superviseur compris), hors CO-ATM.
    const agents = session.dispatch.map((agent) => agent.userId).filter((userId) => userId !== session.creatorId);
    if (!agents.length) continue;

    const ts = toUnix(session.scheduledAt);
    const message = textMessage(
      [
        `## ⏰ Rappel : session ATM <t:${ts}:R>`,
        `${agents.map((userId) => `<@${userId}>`).join(' ')}, vous êtes sur le dispatch de la session prévue à <t:${ts}:t>.`,
        "Rendez-vous au QG à l'heure indiquée.",
        `> [Voir la session](${sessionUrl(session)})`,
      ].join('\n'),
    );
    try {
      const channel = await client.channels.fetch(session.channelId);
      await channel.send({ ...message, allowedMentions: { users: agents } });
    } catch (error) {
      console.error('[Sessions] Envoi du rappel impossible :', error);
    }
  }
}

module.exports = { checkDispatchDeadlines, sendDispatchReminders };
