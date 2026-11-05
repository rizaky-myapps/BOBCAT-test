const AtmSession = require('../models/AtmSession');
const { CLOSED_STATUSES } = require('../atm/constants');
const { renderSessionMessage } = require('../atm/message');
const { findSession } = require('../atm/service');
const { ephemeralText } = require('../utils/v2');

/** Bouton « Je suis disponible » : ajoute / retire l'agent de la liste. */
async function handleAvailableButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeralText('❌ Cette session est introuvable.'));
  if (CLOSED_STATUSES.includes(session.status)) {
    return interaction.reply(ephemeralText('🔒 Cette session est clôturée.'));
  }

  const userId = interaction.user.id;

  // Le superviseur de la session, ou le créateur s'il est CO-ATM (session sans superviseur), ne peut pas se déclarer disponible.
  if (userId === session.supervisorId) {
    return interaction.reply(ephemeralText('⛔ Tu es le superviseur de cette session : tu ne peux pas te déclarer disponible.'));
  }
  if (!session.supervisorId && userId === session.creatorId) {
    return interaction.reply(ephemeralText('⛔ Tu es le CO-ATM de cette session : tu ne peux pas te déclarer disponible.'));
  }

  // Ajout atomique si l'agent n'est pas encore dans la liste…
  let updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, available: { $ne: userId } },
    { $push: { available: userId } },
    { returnDocument: 'after' },
  );
  const joined = Boolean(updated);

  // … sinon on le retire de la liste, sauf s'il est sur le dispatch.
  if (!joined) {
    if (session.dispatch.some((agent) => agent.userId === userId)) {
      return interaction.reply(
        ephemeralText('⛔ Tu es sur le dispatch de cette session : tu ne peux pas te retirer de la liste.'),
      );
    }
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

/** Bouton ⚙️ (en haut à droite du message) : réservé au créateur de la session. */
async function handleManageButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeralText('❌ Cette session est introuvable.'));
  if (session.creatorId !== interaction.user.id) {
    return interaction.reply(ephemeralText('⛔ Seul le créateur de la session peut la modifier.'));
  }
  return interaction.reply(ephemeralText('🚧 En développement'));
}

module.exports = { handleAvailableButton, handleManageButton };
