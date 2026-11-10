const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const { renderProgramReminder, unprogramSession } = require('../atm/programmed');
const { ephemeralText, textMessage } = require('../utils/v2');

const NOT_PROGRAMMED = "ℹ️ Cette session n'est plus programmée (déjà postée ou déprogrammée).";

/**
 * « Déprogrammer » : la session programmée est supprimée et ne sera jamais postée.
 * Depuis /atm (message privé) ou depuis le rappel du salon CO-ATM ("reminder"). Réservé à son CO-ATM.
 */
async function handleUnprogramButton(interaction, [id, source]) {
  const session = isValidObjectId(id) ? await AtmSession.findById(id) : null;
  if (!session || session.status !== 'scheduled') return interaction.reply(ephemeralText(NOT_PROGRAMMED));
  if (session.creatorId !== interaction.user.id) {
    return interaction.reply(ephemeralText('⛔ Seul le CO-ATM qui a programmé cette session peut la déprogrammer.'));
  }

  const deleted = await unprogramSession(interaction.client, session._id, interaction.user.id);
  if (!deleted) return interaction.reply(ephemeralText(NOT_PROGRAMMED));

  // Le rappel du salon CO-ATM est mis à jour par unprogramSession.
  if (source === 'reminder') return interaction.deferUpdate();
  return interaction.update(textMessage('🗑️ Session déprogrammée : elle ne sera pas postée.'));
}

/** « Je veux toujours la faire » (rappel du salon CO-ATM). */
async function handleProgramConfirmButton(interaction, [id]) {
  const session = isValidObjectId(id) ? await AtmSession.findById(id) : null;
  if (!session || session.status !== 'scheduled') return interaction.reply(ephemeralText(NOT_PROGRAMMED));
  if (session.creatorId !== interaction.user.id) {
    return interaction.reply(ephemeralText('⛔ Seul le CO-ATM qui a programmé cette session peut répondre.'));
  }

  const updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, status: 'scheduled' },
    { $set: { 'programReminder.confirmedAt': new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) return interaction.reply(ephemeralText(NOT_PROGRAMMED));
  return interaction.update({ ...renderProgramReminder(updated), allowedMentions: { parse: [] } });
}

module.exports = { handleUnprogramButton, handleProgramConfirmButton };
