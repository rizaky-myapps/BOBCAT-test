const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const AtmSession = require('../models/AtmSession');
const { PROGRAM_REMINDER_BEFORE_PUBLISH } = require('./constants');
const { postSessionMessage } = require('./service');
const { fetchCoAtmChannel } = require('./supervision');
const { toUnix } = require('../utils/date');
const { separator } = require('../utils/v2');

const AFTER = { returnDocument: 'after' };

/**
 * Rappel (salon CO-ATM) d'une session programmée, avec « Je veux toujours la faire » et « Déprogrammer ».
 * @param {string} [finalLine] Issue du rappel (boutons retirés).
 */
function renderProgramReminder(session, finalLine) {
  const ts = toUnix(session.scheduledAt);
  const publish = toUnix(session.publishAt);
  const lines = [
    '## 📅 Session ATM programmée',
    `<@${session.creatorId}>, ta session prévue le <t:${ts}:d> à <t:${ts}:t> sera postée <t:${publish}:R> (à <t:${publish}:t>).`,
    '',
  ];

  let buttons = null;
  if (finalLine) lines.push(finalLine);
  else if (session.programReminder?.confirmedAt) lines.push('✅ **Tu as confirmé vouloir faire cette session.**');
  else {
    lines.push('Veux-tu toujours la faire ?');
    buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`atm:progok:${session._id}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setLabel('Je veux toujours la faire'),
      new ButtonBuilder()
        .setCustomId(`atm:unprog:${session._id}:reminder`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setLabel('Déprogrammer'),
    );
  }

  const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  if (buttons) container.addActionRowComponents(buttons);
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { users: [session.creatorId] },
  };
}

/** Met à jour le rappel du salon CO-ATM (s'il existe) avec l'issue indiquée. */
async function closeProgramReminder(client, session, finalLine) {
  const reminder = session.programReminder;
  if (!reminder?.channelId || !reminder.messageId) return;
  try {
    const channel = await client.channels.fetch(reminder.channelId);
    await channel.messages.edit(reminder.messageId, { ...renderProgramReminder(session, finalLine), allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[Programmation] Mise à jour du rappel impossible :', error);
  }
}

/** Rappel aux CO-ATM 30 min avant la publication de leur session programmée (appelé régulièrement). */
async function sendProgramReminders(client) {
  const due = await AtmSession.find({
    status: 'scheduled',
    programReminder: null,
    publishAt: { $lte: new Date(Date.now() + PROGRAM_REMINDER_BEFORE_PUBLISH) },
  });

  for (const candidate of due) {
    const session = await AtmSession.findOneAndUpdate(
      { _id: candidate._id, status: 'scheduled', programReminder: null },
      { $set: { programReminder: { sentAt: new Date() } } },
      AFTER,
    );
    if (!session) continue;
    try {
      const channel = await fetchCoAtmChannel(client);
      const message = await channel.send(renderProgramReminder(session));
      await AtmSession.findByIdAndUpdate(session._id, {
        $set: { 'programReminder.channelId': channel.id, 'programReminder.messageId': message.id },
      });
    } catch (error) {
      console.error('[Programmation] Envoi du rappel impossible :', error);
    }
  }
}

/** Poste les sessions programmées arrivées à leur heure de publication (1h45 avant le début). */
async function publishProgrammedSessions(client) {
  const due = await AtmSession.find({ status: 'scheduled', publishAt: { $lte: new Date() } });

  for (const candidate of due) {
    // Réservation atomique : la session n'est postée qu'une fois.
    const session = await AtmSession.findOneAndUpdate(
      { _id: candidate._id, status: 'scheduled' },
      { $set: { status: 'pending' } },
      AFTER,
    );
    if (!session) continue;
    try {
      const message = await postSessionMessage(client, session);
      await closeProgramReminder(client, session, `📨 **Session postée :** ${message.url}`);
    } catch (error) {
      console.error('[Programmation] Publication impossible, nouvel essai plus tard :', error);
      await AtmSession.findByIdAndUpdate(session._id, { $set: { status: 'scheduled' } });
    }
  }
}

/**
 * Déprogramme une session : elle est supprimée de la base et ne sera jamais postée.
 * @returns {Promise<object|null>} La session supprimée, ou null si elle n'était plus programmée.
 */
async function unprogramSession(client, sessionId, userId) {
  const session = await AtmSession.findOneAndDelete({ _id: sessionId, status: 'scheduled', creatorId: userId });
  if (session) await closeProgramReminder(client, session, '🗑️ **Session déprogrammée** : elle ne sera pas postée.');
  return session;
}

module.exports = {
  renderProgramReminder,
  sendProgramReminders,
  publishProgrammedSessions,
  unprogramSession,
};
