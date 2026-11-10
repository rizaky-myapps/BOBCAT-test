const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const AtmSession = require('../models/AtmSession');
const { START_CHECK_DELAY, START_DEADLINE } = require('./constants');
const { sessionLinkButton } = require('./service');
const { fetchCoAtmChannel } = require('./supervision');
const { toUnix } = require('../utils/date');
const { separator } = require('../utils/v2');

const AFTER = { returnDocument: 'after' };

/**
 * Question envoyée dans le salon CO-ATM quand une session n'a pas commencé 30 min après l'heure prévue.
 * @param {import('../models/AtmSession')} session
 * @param {string} [finalLine] Issue de la question (boutons retirés).
 */
function renderStartCheck(session, finalLine) {
  const ts = toUnix(session.scheduledAt);
  const check = session.startCheck;
  const lines = [
    '## ⏰ Session ATM non commencée',
    `<@${session.creatorId}>, la session prévue le <t:${ts}:d> à <t:${ts}:t> n'a toujours pas commencé.`,
    '',
  ];

  const buttons = new ActionRowBuilder();
  if (finalLine) {
    lines.push(finalLine);
  } else if (check?.status === 'maintained') {
    const deadline = toUnix(new Date(check.maintainedAt.getTime() + START_DEADLINE));
    lines.push(
      `✅ **Session maintenue** par <@${check.maintainedBy}> : elle doit commencer <t:${deadline}:R>, sinon elle sera annulée.`,
    );
  } else {
    lines.push('Est-elle maintenue ?');
    buttons.addComponents(
      new ButtonBuilder().setCustomId(`atm:keep:${session._id}`).setStyle(ButtonStyle.Success).setLabel('Maintenu'),
      new ButtonBuilder()
        .setCustomId(`atm:pcancel:${session._id}:check`)
        .setStyle(ButtonStyle.Danger)
        .setLabel('Annuler'),
    );
  }

  buttons.addComponents(sessionLinkButton(session));
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addActionRowComponents(buttons);

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { users: [session.creatorId] },
  };
}

/** Envoie la question aux sessions non commencées 30 min après l'heure prévue (appelé régulièrement). */
async function sendStartChecks(client) {
  const due = await AtmSession.find({
    status: 'pending',
    startCheck: null,
    scheduledAt: { $lte: new Date(Date.now() - START_CHECK_DELAY) },
  });

  for (const candidate of due) {
    if (!candidate.messageId) continue;
    // Réservation atomique : la question n'est envoyée qu'une fois.
    const session = await AtmSession.findOneAndUpdate(
      { _id: candidate._id, status: 'pending', startCheck: null },
      { $set: { startCheck: { status: 'asked' } } },
      AFTER,
    );
    if (!session) continue;

    try {
      const channel = await fetchCoAtmChannel(client);
      const message = await channel.send(renderStartCheck(session));
      await AtmSession.findByIdAndUpdate(session._id, {
        $set: { 'startCheck.channelId': channel.id, 'startCheck.messageId': message.id },
      });
    } catch (error) {
      console.error('[Sessions] Envoi de la question « session maintenue ? » impossible :', error);
      await AtmSession.findByIdAndUpdate(session._id, { $set: { startCheck: null } }); // nouvel essai plus tard
    }
  }
}

/** Clôt la question du salon CO-ATM (s'il y en a une ouverte) avec l'issue indiquée. */
async function closeStartCheck(client, session, finalLine) {
  const check = session.startCheck;
  if (!check || check.status === 'closed') return;

  await AtmSession.findByIdAndUpdate(session._id, { $set: { 'startCheck.status': 'closed' } });
  if (!check.channelId || !check.messageId) return;
  try {
    const channel = await client.channels.fetch(check.channelId);
    await channel.messages.edit(check.messageId, renderStartCheck(session, finalLine));
  } catch (error) {
    console.error('[Sessions] Mise à jour de la question impossible :', error);
  }
}

module.exports = { renderStartCheck, sendStartChecks, closeStartCheck };
