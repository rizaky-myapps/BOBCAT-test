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
