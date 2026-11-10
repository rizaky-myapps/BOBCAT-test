const { isValidObjectId } = require('mongoose');
const AtmDraft = require('../models/AtmDraft');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { RADIOS, TENUES, VEHICLES } = require('../atm/constants');
const {
  FIELDS,
  HOUR_CHOICES,
  MINUTE_CHOICES,
  buildDateModal,
  buildInfoModal,
  buildSupervisorChoiceModal,
  truncate,
} = require('../atm/modals');
const { isDraftComplete, isRequestPending, renderPreview } = require('../atm/preview');
const {
  checkSessionDate,
  findConflictingSessions,
  getAvailableChoices,
  getConfirmedSupervisorId,
  getUsedResources,
  isVehicleUsed,
  isCoAtm,
  publishSession,
  resolveVehicle,
  sessionUrl,
} = require('../atm/service');
const { rememberPreview, sendSupervisionRequest } = require('../atm/supervision');
const { formatDateTime, getUpcomingDays, parseDateTime } = require('../utils/date');
const { ephemeralText, textMessage } = require('../utils/v2');

const isIn = (list, value) => list.some((item) => item.value === value);

const NO_DATE_MESSAGE = "📅 Choisis d'abord la date et l'heure de la session.";
const NO_RADIO_MESSAGE = '❌ Toutes les radios sont déjà utilisées par une autre session à ce moment-là : choisis une autre heure.';

/**
 * Radio / véhicule du brouillon déjà pris par une autre session à cette heure-là : ils sont retirés du
 * brouillon et un message l'explique.
 */
async function releaseUsedResources(draft, notices) {
  if (!draft.scheduledAt) return;
  const used = await getUsedResources(draft.guildId, draft.scheduledAt);
  if (draft.radio && used.radios.has(draft.radio)) {
    notices.push('❌ La radio choisie est déjà utilisée par une autre session à ce moment-là : choisis-en une autre.');
    draft.radio = null;
  }
  if (draft.vehicle && isVehicleUsed(used, resolveVehicle(draft.vehicle, draft.plate))) {
    notices.push('❌ Le véhicule choisi est déjà utilisé par une autre session à ce moment-là : choisis-en un autre.');
    draft.vehicle = null;
    draft.plate = '';
  }
}

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

/**
 * Envoie la demande de supervision si tout est prêt : un superviseur choisi (créateur sans le rôle CO ATM),
 * une date valide et aucune demande en attente ou validée.
 */
async function sendRequestIfReady(interaction, draft, notices) {
  if (isCoAtm(interaction.member) || !draft.supervisorId) return;
  if (['pending', 'accepted'].includes(draft.supervisorRequest?.status)) return;
  if (!draft.scheduledAt) {
    notices.push("La demande sera envoyée au superviseur dès que tu auras choisi la date et l'heure.");
    return;
  }
  try {
    draft.supervisorRequest = await sendSupervisionRequest(interaction.client, draft);
    notices.push(
      `📨 Demande envoyée à <@${draft.supervisorId}> dans <#${draft.supervisorRequest.channelId}>.`,
      "Les informations ne sont plus modifiables jusqu'à sa réponse (10 minutes maximum).",
    );
  } catch (error) {
    console.error('[Supervision] Envoi de la demande impossible :', error);
    notices.push(`❌ Impossible d'envoyer la demande au superviseur : ${error.message}.`);
  }
}

/** Enregistre le brouillon, met à jour l'aperçu et affiche les messages éventuels. */
async function saveAndRefresh(interaction, draft, notices = []) {
  await draft.save();
  await updatePreview(interaction, draft);
  if (notices.length) await interaction.followUp(ephemeralText(notices.join('\n')));
}

/* ------------------------------------------------------------------ */
/* Bouton « Informations générales » : tenue, radio, véhicule          */
/* ------------------------------------------------------------------ */

async function handleInfoButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));
  if (!draft.scheduledAt) return interaction.reply(ephemeralText(NO_DATE_MESSAGE));

  // Les radios et véhicules utilisés par une autre session à la même heure ne sont pas proposés.
  const choices = getAvailableChoices(await getUsedResources(draft.guildId, draft.scheduledAt));
  if (!choices.radios.length) return interaction.reply(ephemeralText(NO_RADIO_MESSAGE));
  return interaction.showModal(buildInfoModal(draft, choices));
}

async function handleInfoModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  const { fields } = interaction;
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [vehicle] = fields.getStringSelectValues(FIELDS.vehicle);
  const plate = fields.getTextInputValue(FIELDS.vehicleOther).trim();

  if (!draft.scheduledAt) return interaction.reply(ephemeralText(NO_DATE_MESSAGE));
  const used = await getUsedResources(draft.guildId, draft.scheduledAt);
  const choices = getAvailableChoices(used);
  if (!isIn(TENUES, tenue) || !isIn(RADIOS, radio) || !isIn(VEHICLES, vehicle)) {
    return interaction.reply(ephemeralText('❌ Réponses invalides, réessaie.'));
  }
  if (!resolveVehicle(vehicle, plate)) {
    return interaction.reply(
      ephemeralText('❌ Tu as choisi « Autre » : renseigne la plaque du véhicule. Aucune modification enregistrée.'),
    );
  }
  if (!isIn(choices.radios, radio) || !isIn(choices.vehicles, vehicle) || isVehicleUsed(used, resolveVehicle(vehicle, plate))) {
    return interaction.reply(
      ephemeralText(
        '❌ Cette radio ou ce véhicule est déjà utilisé par une autre session à ce moment-là. Aucune modification enregistrée.',
      ),
    );
  }

  draft.set({ tenue, radio, vehicle, plate });
  return saveAndRefresh(interaction, draft);
}

/* ------------------------------------------------------------------ */
/* Bouton « Choisir la date et l'heure »                               */
/* ------------------------------------------------------------------ */

async function handleDateButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  const days = getUpcomingDays(new Date(), config.timezone);
  const selected = {};
  if (draft.scheduledAt) {
    const [date, time] = formatDateTime(draft.scheduledAt, config.timezone).split(' ');
    const [dd, mm, yyyy] = date.split('/');
    const [hour, minute] = time.split(':');
    Object.assign(selected, { day: `${yyyy}-${mm}-${dd}`, hour, minute });
  }
  return interaction.showModal(buildDateModal(draft, days, selected));
}

async function handleDateModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (isRequestPending(draft)) return interaction.reply(ephemeralText(LOCKED_MESSAGE));

  const { fields } = interaction;
  const [day] = fields.getStringSelectValues(FIELDS.day);
  const [hour] = fields.getStringSelectValues(FIELDS.hour);
  const [minute] = fields.getStringSelectValues(FIELDS.minute);
  const [yyyy, mm, dd] = String(day).split('-');
  const rawDate = `${dd}/${mm}/${yyyy} ${hour}:${minute}`;
  const scheduledAt =
    isIn(HOUR_CHOICES, hour) && isIn(MINUTE_CHOICES, minute) ? parseDateTime(rawDate, config.timezone) : null;
  if (!scheduledAt) return interaction.reply(ephemeralText('❌ Date invalide, réessaie.'));

  // Au moins 10 min à l'avance, et pas pendant une autre session du créateur.
  const dateError = await checkSessionDate(draft.guildId, draft.userId, scheduledAt);
  if (dateError) return interaction.reply(ephemeralText(`${dateError}\nAucune modification enregistrée.`));

  // Le superviseur ne peut pas non plus être sur deux sessions en même temps.
  const notices = [];
  if (draft.supervisorId && !isCoAtm(interaction.member)) {
    const supervisorError = await checkSupervisorAvailability(draft.guildId, draft.supervisorId, scheduledAt);
    if (supervisorError && getConfirmedSupervisorId(draft)) {
      return interaction.reply(
        ephemeralText(
          `${supervisorError}\nTon superviseur ne peut pas être sur deux sessions en même temps : choisis une autre heure.`,
        ),
      );
    }
    if (supervisorError) {
      notices.push(`${supervisorError}\nChoisis un autre superviseur.`);
      draft.set({ supervisorId: null, supervisorRequest: null });
    }
  }

  draft.set({ rawDate, scheduledAt });
  await releaseUsedResources(draft, notices);
  await sendRequestIfReady(interaction, draft, notices);
  return saveAndRefresh(interaction, draft, notices);
}

/* ------------------------------------------------------------------ */
/* Bouton « Sélectionner un superviseur » (membres sans le rôle CO ATM) */
/* ------------------------------------------------------------------ */

/** Message d'erreur si le superviseur ne peut pas (ou plus) être choisi, sinon null. */
function supervisorChoiceError(interaction, draft) {
  if (isCoAtm(interaction.member)) return "ℹ️ Tu as le rôle CO ATM : tu n'as pas besoin de superviseur.";
  if (!draft.scheduledAt) return NO_DATE_MESSAGE;
  if (isRequestPending(draft)) return LOCKED_MESSAGE;
  if (getConfirmedSupervisorId(draft)) return '🔒 Ton superviseur a validé sa présence : il ne peut plus être changé.';
  return null;
}

async function handleSupervisorButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  const error = supervisorChoiceError(interaction, draft);
  if (error) return interaction.reply(ephemeralText(error));

  const supervisors = await getSupervisorChoices(interaction.guild);
  if (!supervisors.length) {
    return interaction.reply(
      ephemeralText('❌ Aucun superviseur enregistré. Utilise la commande `/superviseur` pour en ajouter.'),
    );
  }
  return interaction.showModal(buildSupervisorChoiceModal(draft, supervisors));
}

async function handleSupervisorModal(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  const error = supervisorChoiceError(interaction, draft);
  if (error) return interaction.reply(ephemeralText(error));

  const [supervisorId] = interaction.fields.getStringSelectValues(FIELDS.supervisor);
  if (!supervisorId) return interaction.reply(ephemeralText('❌ Réponse invalide, réessaie.'));

  // Le superviseur ne peut pas être sur deux sessions en même temps.
  if (draft.scheduledAt) {
    const supervisorError = await checkSupervisorAvailability(draft.guildId, supervisorId, draft.scheduledAt);
    if (supervisorError) return interaction.reply(ephemeralText(`${supervisorError}\nChoisis un autre superviseur.`));
  }

  draft.set({ supervisorId, supervisorRequest: null });
  const notices = [];
  await sendRequestIfReady(interaction, draft, notices);
  return saveAndRefresh(interaction, draft, notices);
}

/* ------------------------------------------------------------------ */
/* Bouton « Ping les agents : Oui / Non »                              */
/* ------------------------------------------------------------------ */

async function handlePingButton(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;

  draft.ping = !draft.ping;
  await draft.save();
  return updatePreview(interaction, draft);
}

/* ------------------------------------------------------------------ */
/* Bouton « Poster la session »                                       */
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
    return interaction.reply(ephemeralText(`${dateError}\nModifie la date via « Choisir la date et l'heure » avant de poster la session.`));
  }
  // Une autre session a pu prendre la radio ou le véhicule entre-temps.
  const resourceNotices = [];
  await releaseUsedResources(draft, resourceNotices);
  if (resourceNotices.length) {
    await draft.save();
    await updatePreview(interaction, draft);
    return interaction.followUp(ephemeralText(`${resourceNotices.join('\n')}\nModifie-les via « Informations générales ».`));
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
        ephemeralText(`${supervisorError}\nSa présence est annulée : choisis un autre superviseur via « Sélectionner un superviseur ».`),
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
  handleDateButton,
  handleDateModal,
  handleSupervisorButton,
  handleSupervisorModal,
  handlePingButton,
  handleSendButton,
};
