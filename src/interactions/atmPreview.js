const { isValidObjectId } = require('mongoose');
const AtmDraft = require('../models/AtmDraft');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { RADIOS, TENUES, VEHICLES } = require('../atm/constants');
const { FIELDS, buildInfoModal, buildPlateModal, truncate } = require('../atm/modals');
const { isDraftComplete, renderPreview } = require('../atm/preview');
const { publishSession } = require('../atm/service');
const { parseDateTime } = require('../utils/date');
const { ephemeralText, textMessage } = require('../utils/v2');

const isIn = (list, value) => list.some((item) => item.value === value);

/** Charge le brouillon de l'aperçu ; prévient l'utilisateur s'il a expiré. */
async function loadDraft(interaction, id) {
  const draft = isValidObjectId(id) ? await AtmDraft.findById(id) : null;
  if (!draft) await interaction.reply(ephemeralText('❌ Cet aperçu a expiré. Relance la commande `/atm`.'));
  return draft;
}

/** Superviseurs enregistrés en base, au format des options d'un menu (25 max). */
async function getSupervisorChoices(guild) {
  const supervisors = await Supervisor.find({ guildId: guild.id }).sort({ name: 1 }).limit(25);
  return supervisors.map((supervisor) => ({
    label: truncate(guild.members.cache.get(supervisor.userId)?.displayName ?? (supervisor.name || supervisor.userId), 100),
    value: supervisor.userId,
  }));
}

/* ------------------------------------------------------------------ */
/* Bouton « Informations » → modal à 5 questions                       */
/* ------------------------------------------------------------------ */

async function handleInfoButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  const supervisors = await getSupervisorChoices(interaction.guild);
  if (!supervisors.length) {
    return interaction.reply(
      ephemeralText('❌ Aucun superviseur enregistré. Utilise la commande `/superviseur` pour en ajouter.'),
    );
  }
  return interaction.showModal(buildInfoModal(draft, supervisors));
}

async function handleInfoModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  const { fields } = interaction;
  const rawDate = fields.getTextInputValue(FIELDS.date).trim();
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [vehicle] = fields.getStringSelectValues(FIELDS.vehicle);
  const [supervisorId] = fields.getStringSelectValues(FIELDS.supervisor);

  if (!isIn(TENUES, tenue) || !isIn(RADIOS, radio) || !isIn(VEHICLES, vehicle) || !supervisorId) {
    return interaction.reply(ephemeralText('❌ Réponses invalides, réessaie.'));
  }

  const scheduledAt = parseDateTime(rawDate, config.atm.timezone);
  draft.set({ rawDate, scheduledAt, tenue, radio, vehicle, supervisorId });
  await draft.save();

  await interaction.update(renderPreview(draft));
  if (!scheduledAt) {
    await interaction.followUp(
      ephemeralText(
        `❌ La date \`${rawDate}\` est invalide.\nFormat attendu : \`JJ/MM/AAAA HH:MM\` (ex : \`31/10/2026 21:00\`).`,
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Bouton « Choisir la plaque » (véhicule « Autre »)                   */
/* ------------------------------------------------------------------ */

async function handlePlateButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  return interaction.showModal(buildPlateModal(draft));
}

async function handlePlateModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  draft.plate = interaction.fields.getTextInputValue(FIELDS.vehicleOther).trim();
  await draft.save();
  return interaction.update(renderPreview(draft));
}

/* ------------------------------------------------------------------ */
/* Bouton « Ping agents : OUI / NON »                                  */
/* ------------------------------------------------------------------ */

async function handlePingButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  draft.ping = !draft.ping;
  await draft.save();
  return interaction.update(renderPreview(draft));
}

/* ------------------------------------------------------------------ */
/* Bouton « Envoyer »                                                  */
/* ------------------------------------------------------------------ */

async function handleSendButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (!isDraftComplete(draft)) {
    return interaction.reply(ephemeralText("❌ Complète toutes les informations avant d'envoyer la session."));
  }

  // Suppression atomique : empêche un double envoi en cas de double clic.
  const claimed = await AtmDraft.findOneAndDelete({ _id: draft._id });
  if (!claimed) return interaction.deferUpdate();

  await interaction.deferUpdate();
  try {
    const { message } = await publishSession(interaction, claimed);
    await interaction.editReply(textMessage(`✅ Session ATM publiée dans <#${message.channelId}> : ${message.url}`));
  } catch (error) {
    console.error('[ATM] Publication impossible :', error);
    await AtmDraft.create(claimed.toObject()).catch(() => null);
    await interaction.followUp(ephemeralText(`❌ Impossible de publier la session : ${error.message}`));
  }
}

module.exports = {
  handleInfoButton,
  handleInfoModal,
  handlePlateButton,
  handlePlateModal,
  handlePingButton,
  handleSendButton,
};
