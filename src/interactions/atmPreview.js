const { isValidObjectId } = require('mongoose');
const AtmDraft = require('../models/AtmDraft');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { MIN_POST_DELAY, PROGRAM_THRESHOLD, RADIOS, TENUES, VEHICLE_OTHER } = require('../atm/constants');
const { FIELDS, buildInfoModal, buildSupervisorChoiceModal, truncate } = require('../atm/modals');
const { getPickerState, isSlotAvailable, toSlot } = require('../atm/datePicker');
const { isDraftComplete, isRequestPending, renderPreview, renderSendConfirm } = require('../atm/preview');
const {
  checkSessionDate,
  findConflictingSessions,
  getAtmVehicles,
  getAvailableChoices,
  getConfirmedSupervisorId,
  getPlateError,
  getUsedResources,
  isVehicleUsed,
  isCoAtm,
  isKnownPlate,
  programSession,
  publishSession,
  resolveVehicle,
  sessionUrl,
  unknownPlateMessage,
} = require('../atm/service');
const { rememberPreview, sendSupervisionRequest } = require('../atm/supervision');
const { toUnix } = require('../utils/date');
const { ephemeralText, textMessage } = require('../utils/v2');
const { logAction } = require('../utils/logger');
const EMOJI = require('../emoji');

const isIn = (list, value) => list.some((item) => item.value === value);

const NO_DATE_MESSAGE = `${EMOJI.DATE} Choisis d'abord la date et l'heure de la session.`;
const NO_RADIO_MESSAGE = `${EMOJI.ERREUR} Toutes les radios sont déjà utilisées par une autre session à ce moment-là : choisis une autre heure.`;

/**
 * Radio / véhicule du brouillon déjà pris par une autre session à cette heure-là : ils sont retirés du
 * brouillon et un message l'explique.
 */
async function releaseUsedResources(draft, notices) {
  if (!draft.scheduledAt) return;
  const used = await getUsedResources(draft.guildId, draft.scheduledAt);
  if (draft.radio && used.radios.has(draft.radio)) {
    notices.push(`${EMOJI.ERREUR} La radio choisie est déjà utilisée par une autre session à ce moment-là : choisis-en une autre.`);
    draft.radio = null;
  }
  if (draft.vehicle && isVehicleUsed(used, resolveVehicle(draft.vehicle, draft.plate))) {
    notices.push(`${EMOJI.ERREUR} Le véhicule choisi est déjà utilisé par une autre session à ce moment-là : choisis-en un autre.`);
    draft.vehicle = null;
    draft.plate = '';
  }
}

const LOCKED_MESSAGE =
  `${EMOJI.ATTENTE} En attente de la réponse du superviseur : les informations ne sont pas modifiables pour le moment.`;

/** Charge le brouillon de l'aperçu ; seul son créateur peut le modifier. */
async function loadDraft(interaction, id) {
  const draft = isValidObjectId(id) ? await AtmDraft.findById(id) : null;
  if (!draft) {
    await interaction.reply(ephemeralText(`${EMOJI.ERREUR} Cet aperçu a expiré. Relance la commande \`/atm\`.`));
    return null;
  }
  if (draft.userId !== interaction.user.id) {
    await interaction.reply(ephemeralText(`${EMOJI.INTERDIT} Seul le créateur de la session peut la modifier.`));
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
  return conflict ? `${EMOJI.ERREUR} <@${supervisorId}> est déjà sur une session à ce moment-là : ${sessionUrl(conflict)}` : null;
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
      `${EMOJI.ENVOI} Demande envoyée à <@${draft.supervisorId}> dans <#${draft.supervisorRequest.channelId}>.`,
      "Les informations ne sont plus modifiables jusqu'à sa réponse (10 minutes maximum).",
    );
  } catch (error) {
    console.error('[Supervision] Envoi de la demande impossible :', error);
    notices.push(`${EMOJI.ERREUR} Impossible d'envoyer la demande au superviseur : ${error.message}.`);
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
  const choices = await getAvailableChoices(draft.guildId, await getUsedResources(draft.guildId, draft.scheduledAt));
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
  const rawPlate = fields.getTextInputValue(FIELDS.vehicleOther);
  const isOther = vehicle === VEHICLE_OTHER;
  const plate = isOther ? resolveVehicle(vehicle, rawPlate) ?? '' : '';

  if (!draft.scheduledAt) return interaction.reply(ephemeralText(NO_DATE_MESSAGE));
  const used = await getUsedResources(draft.guildId, draft.scheduledAt);
  const choices = await getAvailableChoices(draft.guildId, used);
  const atmVehicles = await getAtmVehicles(draft.guildId);
  if (!isIn(TENUES, tenue) || !isIn(RADIOS, radio) || (!isOther && !isIn(atmVehicles, vehicle))) {
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Réponses invalides, réessaie.`));
  }
  const plateError = isOther ? getPlateError(rawPlate) : null;
  if (plateError) return interaction.reply(ephemeralText(`${plateError} Aucune modification enregistrée.`));
  // « Autre » : la plaque doit être celle d'un véhicule de la base (/gestion → Véhicules).
  if (isOther && !(await isKnownPlate(draft.guildId, rawPlate))) {
    return interaction.reply(ephemeralText(`${unknownPlateMessage(rawPlate)} Aucune modification enregistrée.`));
  }
  if (!isIn(choices.radios, radio) || !isIn(choices.vehicles, vehicle)) {
    return interaction.reply(
      ephemeralText(
        `${EMOJI.ERREUR} Cette radio ou ce véhicule est déjà utilisé par une autre session à ce moment-là. Aucune modification enregistrée.`,
      ),
    );
  }
  // « Autre » : la plaque saisie ne doit pas être celle d'un véhicule déjà utilisé à ce moment-là.
  if (isVehicleUsed(used, resolveVehicle(vehicle, plate))) {
    return interaction.reply(
      ephemeralText(
        `${EMOJI.ERREUR} La plaque \`${plate}\` est déjà utilisée par une autre session à ce moment-là : choisis-en une autre. Aucune modification enregistrée.`,
      ),
    );
  }

  draft.set({ tenue, radio, vehicle, plate });
  return saveAndRefresh(interaction, draft);
}

/* ------------------------------------------------------------------ */
/* Bouton « Choisir la date et l'heure » : listes Date → Heure → Minutes */
/* ------------------------------------------------------------------ */

/** Affiche l'aperçu avec le choix de la date et de l'heure (seuls les horaires à venir sont proposés). */
async function showDatePicker(interaction, draft, state) {
  await interaction.update(renderPreview(draft, interaction.guild, { picker: state }));
  rememberPreview(interaction, draft);
}

/** Brouillon modifiable par le créateur (pas de demande de supervision en attente), sinon null. */
async function loadEditableDraft(interaction, id) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return null;
  if (isRequestPending(draft)) {
    await interaction.reply(ephemeralText(LOCKED_MESSAGE));
    return null;
  }
  return draft;
}

/** Bouton « Choisir la date et l'heure » (et « Non, changer la date et l'heure ») : la date actuelle est pré-sélectionnée. */
async function handleDateButton(interaction, [id]) {
  const draft = await loadEditableDraft(interaction, id);
  if (!draft) return;
  return showDatePicker(interaction, draft, getPickerState(draft));
}

/** Liste Date : la liste Heure apparaît. */
async function handleDayPick(interaction, [id]) {
  const draft = await loadEditableDraft(interaction, id);
  if (!draft) return;
  const [day] = interaction.values;
  return showDatePicker(interaction, draft, { day });
}

/** Liste Heure : la liste Minutes apparaît. */
async function handleHourPick(interaction, [id, day]) {
  const draft = await loadEditableDraft(interaction, id);
  if (!draft) return;
  const [hour] = interaction.values;
  return showDatePicker(interaction, draft, { day, hour });
}

/** Bouton « Retour » : l'aperçu revient sans changement. */
async function handlePickBack(interaction, [id]) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  return updatePreview(interaction, draft);
}

/** Liste Minutes : la date et l'heure sont enregistrées, l'aperçu revient. */
async function handleMinutePick(interaction, [id, day, hour]) {
  const draft = await loadEditableDraft(interaction, id);
  if (!draft) return;
  const [minute] = interaction.values;

  // Refus : les listes restent affichées (date et heure choisies) et un message l'explique.
  const refuse = async (message) => {
    await showDatePicker(interaction, draft, { day, hour });
    return interaction.followUp(ephemeralText(message));
  };

  // L'horaire a pu passer depuis l'affichage des listes.
  if (!isSlotAvailable(day, hour, minute)) {
    return refuse(`${EMOJI.ERREUR} Cet horaire est déjà passé : choisis-en un autre.`);
  }
  const { rawDate, scheduledAt } = toSlot(day, hour, minute);

  // Pas pendant une autre session du créateur.
  const dateError = await checkSessionDate(draft.guildId, draft.userId, scheduledAt);
  if (dateError) return refuse(`${dateError}\nAucune modification enregistrée.`);

  // Le superviseur ne peut pas non plus être sur deux sessions en même temps.
  const notices = [];
  if (draft.supervisorId && !isCoAtm(interaction.member)) {
    const supervisorError = await checkSupervisorAvailability(draft.guildId, draft.supervisorId, scheduledAt);
    if (supervisorError && getConfirmedSupervisorId(draft)) {
      return refuse(
        `${supervisorError}\nTon superviseur ne peut pas être sur deux sessions en même temps : choisis une autre heure.`,
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
  if (isCoAtm(interaction.member)) return `${EMOJI.INFO} Tu as le rôle CO ATM : tu n'as pas besoin de superviseur.`;
  if (!draft.scheduledAt) return NO_DATE_MESSAGE;
  if (isRequestPending(draft)) return LOCKED_MESSAGE;
  if (getConfirmedSupervisorId(draft)) return `${EMOJI.VERROUILLE} Ton superviseur a validé sa présence : il ne peut plus être changé.`;
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
      ephemeralText(`${EMOJI.ERREUR} Aucun superviseur enregistré. Ajoute-en via \`/gestion\` → « Superviseur ATM ».`),
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
  if (!supervisorId) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Réponse invalide, réessaie.`));

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

/**
 * Poste (ou programme) la session. Si elle commence dans moins de 10 minutes, une confirmation est
 * d'abord demandée (`confirmed` : « Oui, j'en suis sûr ! » cliqué).
 */
async function sendSession(interaction, id, confirmed) {
  const draft = await loadDraft(interaction, id);
  if (!draft) return;
  if (!isDraftComplete(draft, interaction.guild)) {
    return interaction.reply(
      ephemeralText(
        `${EMOJI.ERREUR} Complète toutes les informations avant d'envoyer la session (et attends la validation du superviseur).`,
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

  // Moins de 10 minutes avant son début : confirmation demandée.
  if (!confirmed && draft.scheduledAt.getTime() - Date.now() < MIN_POST_DELAY) {
    return interaction.update(renderSendConfirm(draft));
  }

  // Suppression atomique : empêche un double envoi en cas de double clic.
  const claimed = await AtmDraft.findOneAndDelete({ _id: draft._id });
  if (!claimed) return interaction.deferUpdate();
  logAction('BDD', `Suppression dans Session-ATM-Draft : brouillon ${claimed._id} (session postée ou programmée)`);

  await interaction.deferUpdate();
  try {
    // Prévue dans plus de 5h : programmée, elle sera postée automatiquement 1h45 avant son début.
    if (claimed.scheduledAt.getTime() - Date.now() > PROGRAM_THRESHOLD) {
      const session = await programSession(interaction, claimed);
      const ts = toUnix(session.scheduledAt);
      const publish = toUnix(session.publishAt);
      await interaction.editReply(
        textMessage(
          `${EMOJI.STATUT_PROGRAMMEE} **Session programmée** pour le <t:${ts}:d> à <t:${ts}:t>.\nElle sera postée automatiquement <t:${publish}:R> (à <t:${publish}:t>), 1h45 avant son début.`,
        ),
      );
      return;
    }
    const { message } = await publishSession(interaction, claimed);
    await interaction.editReply(textMessage(`${EMOJI.SUCCES} Session ATM publiée dans <#${message.channelId}> : ${message.url}`));
  } catch (error) {
    console.error('[ATM] Publication impossible :', error);
    await AtmDraft.create(claimed.toObject()).catch(() => null);
    logAction('BDD', `Création dans Session-ATM-Draft : brouillon ${claimed._id} restauré (publication impossible)`);
    await interaction.followUp(ephemeralText(`${EMOJI.ERREUR} Impossible de publier la session : ${error.message}`));
  }
}

/** Bouton « Poster la session ». */
const handleSendButton = (interaction, [id]) => sendSession(interaction, id, false);

/** Bouton « Oui, j'en suis sûr ! » (session qui commence dans moins de 10 minutes). */
const handleSendConfirm = (interaction, [id]) => sendSession(interaction, id, true);

module.exports = {
  handleInfoButton,
  handleInfoModal,
  handleDateButton,
  handleDayPick,
  handleHourPick,
  handleMinutePick,
  handlePickBack,
  handleSupervisorButton,
  handleSupervisorModal,
  handlePingButton,
  handleSendButton,
  handleSendConfirm,
};
