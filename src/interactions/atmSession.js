const { MessageFlags } = require('discord.js');
const AtmSession = require('../models/AtmSession');
const { CLOSED_STATUSES } = require('../atm/constants');
const { renderSessionMessage } = require('../atm/message');
const { renderSessionPanel } = require('../atm/panel');
const { canManageSession, findConflictingSessions, findSession, sessionUrl } = require('../atm/service');
const { ephemeralText } = require('../utils/v2');

/**
 * Bouton « Je suis disponible » : ajoute / retire l'agent de la liste.
 * Seuls les membres qui ne sont pas sur le dispatch (rôle CO-ATM ou non) peuvent voter.
 */
async function handleAvailableButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeralText('❌ Cette session est introuvable.'));
  if (CLOSED_STATUSES.includes(session.status)) {
    return interaction.reply(ephemeralText('🔒 Cette session est clôturée.'));
  }
  if (session.status === 'in_progress') {
    return interaction.reply(ephemeralText('🔒 Cette session a déjà commencé.'));
  }
  if (session.dispatchedAt) {
    return interaction.reply(ephemeralText('🔒 Le dispatching de cette session est déjà fait.'));
  }

  const userId = interaction.user.id;
  if (userId === session.creatorId) {
    return interaction.reply(ephemeralText('⛔ Tu es le CO-ATM de cette session : tu ne peux pas te déclarer disponible.'));
  }
  if (session.dispatch.some((agent) => agent.userId === userId)) {
    return interaction.reply(
      ephemeralText('⛔ Tu es sur le dispatch de cette session : tu ne peux pas te déclarer disponible.'),
    );
  }

  // Pas de vote pendant une autre session du membre (une session dure environ 1h30).
  if (!session.available.includes(userId)) {
    const [conflict] = await findConflictingSessions(session.guildId, userId, session.scheduledAt, session._id);
    if (conflict) {
      return interaction.reply(
        ephemeralText(
          `⛔ Tu es déjà sur une session à ce moment-là : ${sessionUrl(conflict)}\nUne session dure environ 1h30 : tu ne peux pas voter pour celle-ci.`,
        ),
      );
    }
  }

  // Ajout atomique si l'agent n'est pas encore dans la liste…
  let updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, available: { $ne: userId } },
    { $push: { available: userId } },
    { returnDocument: 'after' },
  );
  const joined = Boolean(updated);

  // … sinon on le retire de la liste.
  if (!joined) {
    updated = await AtmSession.findByIdAndUpdate(
      session._id,
      { $pull: { available: userId } },
      { returnDocument: 'after' },
    );
  }

  await interaction.update(renderSessionMessage(updated));
  await interaction.followUp(
    ephemeralText(
      joined
        ? '✅ Tu es maintenant dans la liste des agents disponibles. Reclique sur le bouton pour te retirer.'
        : '↩️ Tu as été retiré de la liste des agents disponibles.',
    ),
  );
}

/** Bouton ⚙️ : panneau de gestion, réservé au CO-ATM de la session et à la direction. */
async function handleManageButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeralText('❌ Cette session est introuvable.'));
  if (!canManageSession(interaction, session)) {
    return interaction.reply(ephemeralText('⛔ Seuls le CO-ATM de la session et la direction peuvent la gérer.'));
  }
  if (CLOSED_STATUSES.includes(session.status)) {
    return interaction.reply(ephemeralText('🔒 Cette session est clôturée.'));
  }

  const panel = await renderSessionPanel(session);
  return interaction.reply({ ...panel, flags: panel.flags | MessageFlags.Ephemeral });
}

module.exports = { handleAvailableButton, handleManageButton };
