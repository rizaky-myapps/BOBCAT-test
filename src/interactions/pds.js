const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const PdsAtm = require('../models/PdsAtm');
const { MAX_MALLETTES } = require('../atm/constants');
const { FIELDS, getUploadedFiles } = require('../atm/modals');
const { deletePdsContent, renderPdsMessage, replacePdsImage } = require('../atm/pds');
const { canManageSession, findSession } = require('../atm/service');
const { buildPdsEditModal } = require('../atm/sessionModals');
const { ephemeralText, textMessage } = require('../utils/v2');

/**
 * Charge la PDS et sa session ; seuls le CO-ATM de la session et la direction peuvent la modifier,
 * et uniquement tant que la session est en cours.
 */
async function loadEditablePds(interaction, id) {
  const pds = isValidObjectId(id) ? await PdsAtm.findById(id) : null;
  const session = pds ? await findSession(String(pds.sessionId)) : null;

  let error = null;
  if (!pds || !session) error = '❌ Cette PDS est introuvable.';
  else if (!canManageSession(interaction, session)) error = '⛔ Seuls le CO-ATM de la session et la direction peuvent modifier cette PDS.';
  else if (session.status !== 'in_progress') error = "❌ La session n'est plus active : la modification n'est pas possible.";

  if (error) {
    await interaction.reply(ephemeralText(error));
    return null;
  }
  return { pds, session };
}

/** Bouton ✏️ : modifier la photo et le nombre de mallettes. */
async function handlePdsEditButton(interaction, [id]) {
  const loaded = await loadEditablePds(interaction, id);
  if (!loaded) return;
  return interaction.showModal(buildPdsEditModal(loaded.pds));
}

async function handlePdsEditModal(interaction, [id]) {
  const loaded = await loadEditablePds(interaction, id);
  if (!loaded) return;
  const { pds, session } = loaded;

  const mallettes = Number(interaction.fields.getStringSelectValues(FIELDS.mallettes)[0]);
  const [attachment] = getUploadedFiles(interaction, FIELDS.photo);
  if (!Number.isInteger(mallettes) || mallettes < 1 || mallettes > MAX_MALLETTES) {
    return interaction.reply(ephemeralText('❌ Nombre de mallettes invalide.'));
  }
  if (attachment && !attachment.contentType?.startsWith('image/')) {
    return interaction.reply(ephemeralText('❌ Le fichier envoyé doit être une image.'));
  }

  // L'envoi de la photo sur Cloudinary peut dépasser les 3 secondes accordées par Discord.
  await interaction.deferUpdate();
  try {
    if (attachment) await replacePdsImage(pds, attachment);
    pds.mallettes = mallettes;
    await pds.save();
  } catch (error) {
    console.error('[PDS] Modification impossible :', error);
    return interaction.followUp(ephemeralText(`❌ Impossible de modifier la PDS : ${error.message}`));
  }

  await interaction.editReply(renderPdsMessage(pds, session));
  return interaction.followUp(ephemeralText('✅ PDS modifiée.'));
}

/** « Oui, supprimer la PDS » (menu contextuel « Supprimer la PDS ») : base de données, photo et message. */
async function handlePdsDeleteButton(interaction, [id]) {
  const pds = isValidObjectId(id) ? await PdsAtm.findById(id) : null;
  if (!pds) return interaction.update(textMessage('ℹ️ Cette PDS a déjà été supprimée.'));
  const session = await findSession(String(pds.sessionId));
  if (session && !canManageSession(interaction, session)) {
    return interaction.reply(ephemeralText('⛔ Seuls le CO-ATM de la session et la direction peuvent supprimer cette PDS.'));
  }

  // Suppression atomique en base (évite une double suppression), puis photo et message.
  const deleted = await PdsAtm.findOneAndDelete({ _id: pds._id });
  if (!deleted) return interaction.update(textMessage('ℹ️ Cette PDS a déjà été supprimée.'));
  await interaction.deferUpdate();
  await deletePdsContent(interaction.client, deleted);
  return interaction.editReply(textMessage(`🗑️ PDS n°${String(deleted.number).padStart(2, '0')} supprimée.`));
}

/** « Annuler » : la PDS n'est pas supprimée. */
async function handlePdsDeleteCancel(interaction) {
  return interaction.update(textMessage('↩️ Suppression annulée.'));
}

module.exports = { handlePdsEditButton, handlePdsEditModal, handlePdsDeleteButton, handlePdsDeleteCancel };
