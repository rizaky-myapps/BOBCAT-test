const { MessageFlags } = require('discord.js');
const AtmSession = require('../models/AtmSession');
const { CLOSED_STATUSES } = require('../atm/constants');
const { renderSessionMessage } = require('../atm/message');
const { renderPanel } = require('../atm/panel');
const { canManageSession, findSession } = require('../atm/service');

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/** Bouton « Je suis disponible » : ajoute / retire l'agent de la liste. */
async function handleAvailableButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeral('❌ Cette session est introuvable.'));
  if (CLOSED_STATUSES.includes(session.status)) {
    return interaction.reply(ephemeral('🔒 Cette session est clôturée.'));
  }

  const userId = interaction.user.id;

  // Ajout atomique si l'agent n'est pas encore dans la liste…
  let updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, available: { $ne: userId } },
    { $push: { available: userId } },
    { returnDocument: 'after' },
  );
  const joined = Boolean(updated);

  // … sinon on le retire (des disponibles et du dispatch).
  if (!joined) {
    updated = await AtmSession.findByIdAndUpdate(
      session._id,
      { $pull: { available: userId, dispatch: { userId } } },
      { returnDocument: 'after' },
    );
  }

  await interaction.update(renderSessionMessage(updated));
  await interaction.followUp(
    ephemeral(
      joined
        ? '✅ Tu es maintenant dans la liste des agents disponibles. Reclique sur le bouton pour te retirer.'
        : '↩️ Tu as été retiré de la liste des agents disponibles.',
    ),
  );
}

/** Bouton ⚙️ : ouvre le panneau de gestion (réservé au créateur et aux responsables). */
async function handleManageButton(interaction, [id]) {
  const session = await findSession(id);
  if (!session) return interaction.reply(ephemeral('❌ Cette session est introuvable.'));
  if (!canManageSession(interaction, session)) {
    return interaction.reply(ephemeral('⛔ Seul le créateur de la session ou un responsable peut la gérer.'));
  }

  const panel = renderPanel(session);
  return interaction.reply({ ...panel, flags: panel.flags | MessageFlags.Ephemeral });
}

module.exports = { handleAvailableButton, handleManageButton };
