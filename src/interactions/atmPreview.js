const { isValidObjectId } = require('mongoose');
const AtmDraft = require('../models/AtmDraft');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { RADIOS, TENUES, VEHICLES } = require('../atm/constants');
const { FIELDS, buildInfoModal, buildPlateModal, truncate } = require('../atm/modals');
const { isDraftComplete, isRequestPending, renderPreview } = require('../atm/preview');
const {
  checkSessionDate,
  findConflictingSessions,
  getConfirmedSupervisorId,
  isCoAtm,
  publishSession,
  sessionUrl,
} = require('../atm/service');
const { rememberPreview, sendSupervisionRequest } = require('../atm/supervision');
const { parseDateTime } = require('../utils/date');
const { ephemeralText, textMessage } = require('../utils/v2');

const isIn = (list, value) => list.some((item) => item.value === value);

const LOCKED_MESSAGE =
  '⏳ En attente de la réponse du superviseur : les informations ne sont pas modifiables pour le moment.';

/** Charge le brouillon de l'aperçu ; seul son créateur peut le modifier. */
async function loadDraft(interaction, id) {
  const draft = isValidObjectId(id) ? await AtmDraft.findById(id) : null;
  if (!draft) {
    await interaction.reply(ephemeralText('❌ Cet aperçu a expiré. Relance la commande `/atm`.'));
    return null;
  }
  if (draft.userId !== interaction.user.id) {
    await interaction.reply(ephemeralText('⛔ Seul le créateur de la session peut la modifier.'));
    return null;
  }
  return draft;
}

/** Met à jour l'aperçu en réponse à l'interaction et retient celle-ci pour les mises à jour ultérieures. */
async function updatePreview(interaction, draft) {
  await interaction.update(renderPreview(draft, interaction.guild));
  rememberPreview(interaction, draft);
}

/** Message d'erreur si le superviseur est déjà sur une session qui chevauche `scheduledAt`, sinon null. */
async function checkSupervisorAvailability(guildId, supervisorId, scheduledAt) {
  const [conflict] = await findConflictingSessions(guildId, supervisorId, scheduledAt);
  return conflict ? `❌ <@${supervisorId}> est déjà sur une session à ce moment-là : ${sessionUrl(conflict)}` : null;
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
/* Bouton « Informations » → modal                                     */
/* ------------------------------------------------------------------ */

async function handleInfoButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  // Le choix du superviseur n'est proposé qu'aux membres sans le rôle CO ATM,
  // et plus du tout une fois que le superviseur a validé sa présence.
  let supervisors = null;
  if (!isCoAtm(interaction.member) && !getConfirmedSupervisorId(draft)) {
    supervisors = await getSupervisorChoices(interaction.guild);
    if (!supervisors.length) {
      return interaction.reply(
        ephemeralText('❌ Aucun superviseur enregistré. Utilise la commande `/superviseur` pour en ajouter.'),
      );
    }
  }
  return interaction.showModal(buildInfoModal(draft, supervisors));
}

async function handleInfoModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  const { fields } = interaction;
  const rawDate = fields.getTextInputValue(FIELDS.date).trim();
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [vehicle] = fields.getStringSelectValues(FIELDS.vehicle);
  const coAtm = isCoAtm(interaction.member);
  // Superviseur ayant validé sa présence : il ne peut plus être changé.
  const accepted = !coAtm && Boolean(getConfirmedSupervisorId(draft));
  const askSupervisor = !coAtm && !accepted;
  let supervisorId = accepted ? draft.supervisorId : null;
  if (askSupervisor && fields.fields.has(FIELDS.supervisor)) supervisorId = fields.getStringSelectValues(FIELDS.supervisor)[0];

  if (!isIn(TENUES, tenue) || !isIn(RADIOS, radio) || !isIn(VEHICLES, vehicle) || (askSupervisor && !supervisorId)) {
    return interaction.reply(ephemeralText('❌ Réponses invalides, réessaie.'));
  }

  let scheduledAt = parseDateTime(rawDate, config.timezone);
  const notices = [];
  if (!scheduledAt) {
    notices.push(
      `❌ La date \`${rawDate}\` est invalide.\nFormat attendu : \`JJ/MM/AAAA HH:MM\` (ex : \`31/10/2026 21:00\`).`,
    );
  } else {
    // Au moins 10 min à l'avance, et pas pendant une autre session du créateur.
    const dateError = await checkSessionDate(draft.guildId, draft.userId, scheduledAt);
    if (dateError) {
      notices.push(dateError);
      scheduledAt = null;
    }
  }

  // Le superviseur ne peut pas non plus être sur deux sessions en même temps.
  if (scheduledAt && supervisorId) {
    const supervisorError = await checkSupervisorAvailability(draft.guildId, supervisorId, scheduledAt);
    if (supervisorError) {
      if (accepted) {
        notices.push(`${supervisorError}\nTon superviseur ne peut pas être sur deux sessions en même temps : choisis une autre heure.`);
        scheduledAt = null;
      } else {
        notices.push(`${supervisorError}\nChoisis un autre superviseur.`);
        supervisorId = null;
      }
    }
  }

  draft.set({ rawDate, scheduledAt, tenue, radio, vehicle, supervisorId });
  if (!accepted) draft.supervisorRequest = null;

  if (!scheduledAt) {
    if (askSupervisor && supervisorId) notices.push('La demande sera envoyée au superviseur une fois la date corrigée.');
  } else if (askSupervisor && supervisorId) {
    try {
      draft.supervisorRequest = await sendSupervisionRequest(interaction.client, draft);
      notices.push(
        `📨 Demande envoyée à <@${supervisorId}> dans <#${draft.supervisorRequest.channelId}>.`,
        "Les informations ne sont plus modifiables jusqu'à sa réponse (10 minutes maximum).",
      );
    } catch (error) {
      console.error('[Supervision] Envoi de la demande impossible :', error);
      notices.push(`❌ Impossible d'envoyer la demande au superviseur : ${error.message}.`);
    }
  }

  await draft.save();
  await updatePreview(interaction, draft);
  if (notices.length) await interaction.followUp(ephemeralText(notices.join('\n')));
}

/* ------------------------------------------------------------------ */
/* Bouton « Choisir la plaque » (véhicule « Autre »)                   */
/* ------------------------------------------------------------------ */

async function handlePlateButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));
  return interaction.showModal(buildPlateModal(draft));
}

async function handlePlateModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  draft.plate = interaction.fields.getTextInputValue(FIELDS.vehicleOther).trim();
  await draft.save();
  return updatePreview(interaction, draft);
}

/* ------------------------------------------------------------------ */
/* Bouton « Ping agents : OUI / NON »                                  */
/* ------------------------------------------------------------------ */

async function handlePingButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  draft.ping = !draft.ping;
  await draft.save();
  return updatePreview(interaction, draft);
}

/* ------------------------------------------------------------------ */
/* Bouton « Envoyer »                                                  */
/* ------------------------------------------------------------------ */

async function handleSendButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (!isDraftComplete(draft, interaction.guild)) {
    return interaction.reply(
      ephemeralText(
        "❌ Complète toutes les informations avant d'envoyer la session (et attends la validation du superviseur).",
      ),
    );
  }
  // L'heure a pu se rapprocher, ou une autre session a pu être prévue entre-temps.
  const dateError = await checkSessionDate(draft.guildId, draft.userId, draft.scheduledAt);
  if (dateError) {
    return interaction.reply(ephemeralText(`${dateError}\nModifie la date via « Informations » avant d'envoyer.`));
  }
  // Le superviseur a pu être placé sur une autre session au même moment depuis sa validation.
  const confirmedSupervisorId = getConfirmedSupervisorId(draft);
  if (confirmedSupervisorId) {
    const supervisorError = await checkSupervisorAvailability(draft.guildId, confirmedSupervisorId, draft.scheduledAt);
    if (supervisorError) {
      draft.supervisorId = null;
      draft.supervisorRequest = null;
      await draft.save();
      await updatePreview(interaction, draft);
      return interaction.followUp(
        ephemeralText(`${supervisorError}\nSa présence est annulée : choisis un autre superviseur via « Informations ».`),
      );
    }
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
