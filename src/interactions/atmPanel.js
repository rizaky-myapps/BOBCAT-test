const { MessageFlags } = require('discord.js');
const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const PdsAtm = require('../models/PdsAtm');
const {
  CANCEL_OTHER,
  CANCEL_REASONS,
  CLOSED_STATUSES,
  MAX_MALLETTES,
  MIN_DISPATCH,
  RADIOS,
  START_EARLY_WINDOW,
  TENUES,
  VEHICLES,
  VEHICLE_OTHER,
} = require('../atm/constants');
const { cancelSession, finishSession, startSession } = require('../atm/lifecycle');
const { FIELDS, getUploadedFiles, truncate } = require('../atm/modals');
const { renderConfirm, renderSessionPanel } = require('../atm/panel');
const { createPds } = require('../atm/pds');
const {
  buildCancelModal,
  buildDispatchModal,
  buildDriverModal,
  buildPdsModal,
  buildReplaceModal,
  buildReplacePickModal,
  buildSessionInfoModal,
} = require('../atm/sessionModals');
const {
  buildDispatch,
  canManageSession,
  findSession,
  getAgentSlots,
  getDispatchedAgents,
  getAvailableChoices,
  getMinAgents,
  getPlateError,
  getUsedResources,
  hasRole,
  isBiker,
  isVehicleUsed,
  resolveVehicle,
  syncSessionMessage,
} = require('../atm/service');
const { renderStartCheck } = require('../atm/startCheck');
const { isCloudinaryEnabled } = require('../services/cloudinary');
const { toUnix } = require('../utils/date');
const { ephemeralText, textMessage } = require('../utils/v2');

const AFTER = { returnDocument: 'after' };
const isIn = (list, value) => list.some((item) => item.value === value);

const STATUS_ERRORS = {
  pending: "❌ Cette action n'est possible que pour une session en attente (pas encore commencée).",
  in_progress: '❌ Aucune session en cours : cette action est impossible.',
};

/**
 * Charge la session et vérifie que l'utilisateur peut la gérer (CO-ATM ou direction)
 * et qu'elle a le statut attendu. Répond à l'utilisateur et renvoie null sinon.
 */
async function loadManageable(interaction, id, status) {
  const session = await findSession(id);
  let error = null;
  if (!session) error = '❌ Cette session est introuvable.';
  else if (!canManageSession(interaction, session)) error = '⛔ Seuls le CO-ATM de la session et la direction peuvent la gérer.';
  else if (status && session.status !== status) error = STATUS_ERRORS[status];

  if (!error) return session;
  if (interaction.deferred || interaction.replied) await interaction.followUp(ephemeralText(error));
  else await interaction.reply(ephemeralText(error));
  return null;
}

/** Nom affiché d'un membre (surnom sur le serveur). */
const memberName = (guild, userId) => {
  const member = guild.members.cache.get(userId);
  return truncate(member?.nickname ?? member?.displayName ?? userId, 100);
};

/**
 * Libellé d'un agent dans les listes du dispatching : pseudo suivi de ses habilitations,
 * ex : « Yvick Waler 🏍️ 🔫 », « Yvick Waler 🏍️ », « Yvick Waler 🔫 » (🏍️ U2R, 🔫 fusil à pompe, toujours en dernier).
 */
function agentLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  const tags = [];
  if (isBiker(member)) tags.push('🏍️');
  if (hasRole(member, config.roles.fusilAPompe)) tags.push('🔫');
  const suffix = tags.length ? ` ${tags.join(' ')}` : '';
  return `${truncate(member?.nickname ?? member?.displayName ?? userId, 100 - suffix.length)}${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Annuler (panneau ⚙️ ou question du salon CO-ATM)                    */
/* ------------------------------------------------------------------ */

async function handleCancelButton(interaction, [id, source = 'panel']) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  // Double vérification : dans le panneau, ou en message privé depuis la question du salon CO-ATM.
  const confirm = renderConfirm(session, 'cancel', source);
  if (source === 'panel') return interaction.update(confirm);
  return interaction.reply({ ...confirm, flags: confirm.flags | MessageFlags.Ephemeral });
}

/** « Oui, annuler la session » : ouvre le modal de la raison. */
async function handleCancelConfirm(interaction, [id, source = 'panel']) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  return interaction.showModal(buildCancelModal(session, source));
}

/** « Retour » : abandonne l'annulation ou la fin de session. */
async function handleBack(interaction, [id, source = 'panel']) {
  if (source !== 'panel') return interaction.update(textMessage('↩️ Annulation abandonnée.'));
  const session = await loadManageable(interaction, id);
  if (!session) return;
  if (CLOSED_STATUSES.includes(session.status)) return interaction.update(textMessage('🔒 Cette session est clôturée.'));
  return interaction.update(await renderSessionPanel(session));
}

async function handleCancelModal(interaction, [id]) {
  const [reason] = interaction.fields.getStringSelectValues(FIELDS.cancelReason);
  const details = interaction.fields.getTextInputValue(FIELDS.cancelDetails).trim() || null;
  if (!isIn(CANCEL_REASONS, reason)) return interaction.reply(ephemeralText('❌ Raison invalide.'));
  if (reason === CANCEL_OTHER && !details) {
    return interaction.reply(
      ephemeralText('❌ Tu as choisi « Autre » : précise la raison dans le champ prévu. La session n’a pas été annulée.'),
    );
  }

  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  await interaction.deferUpdate();
  const cancelled = await cancelSession(interaction.client, session._id, {
    reason,
    details: reason === CANCEL_OTHER ? details : null,
    by: interaction.user.id,
  });
  if (!cancelled) return interaction.followUp(ephemeralText(STATUS_ERRORS.pending));
  // Le message de confirmation (panneau ou message privé) est remplacé.
  return interaction.editReply(textMessage('🛑 Session annulée.'));
}

/** Bouton « Maintenu » de la question du salon CO-ATM. */
async function handleKeepButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, status: 'pending', 'startCheck.status': 'asked' },
    { $set: { 'startCheck.status': 'maintained', 'startCheck.maintainedAt': new Date(), 'startCheck.maintainedBy': interaction.user.id } },
    AFTER,
  );
  if (!updated) return interaction.reply(ephemeralText("ℹ️ Cette question n'est plus d'actualité."));
  return interaction.update(renderStartCheck(updated));
}

/* ------------------------------------------------------------------ */
/* Dispatching (2 modals : agents, puis conducteur / motard)           */
/* ------------------------------------------------------------------ */

async function handleDispatchButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  // Agents déjà dispatchés : remplacement (une raison par agent remplacé).
  const dispatched = getDispatchedAgents(session);
  if (dispatched.length) {
    const agents = dispatched.map((agent) => ({ userId: agent.userId, name: memberName(interaction.guild, agent.userId) }));
    return interaction.showModal(buildReplaceModal(session, agents));
  }

  const voters = getCandidates(session).slice(0, 25);
  if (!voters.length) {
    return interaction.reply(ephemeralText("❌ Aucun agent n'a voté « Je suis disponible » sur cette session."));
  }
  const options = voters.map((userId) => ({ label: agentLabel(interaction.guild, userId), value: userId, default: false }));
  return interaction.showModal(buildDispatchModal(session, options, getAgentSlots(session)));
}

/** Agents pouvant être ajoutés au dispatch : ont voté, ne sont pas sur le dispatch, ni en cours de remplacement. */
function getCandidates(session) {
  const excluded = new Set([
    session.creatorId,
    session.supervisorId,
    ...session.dispatch.map((agent) => agent.userId),
    ...(session.pendingReplacement?.agents ?? []).map((agent) => agent.userId),
  ]);
  return session.available.filter((userId) => !excluded.has(userId));
}

/** Vérifie le nombre d'agents et la règle de l'U2R (l'agent en plus du véhicule part en moto). */
function checkAgentGroup(guild, session, group, { allowEmpty = false } = {}) {
  const { vehicleSeats, maxAgents } = getAgentSlots(session);
  if ((!group.length && !allowEmpty) || group.length > maxAgents) return `❌ Sélectionne entre 1 et ${maxAgents} agents.`;
  if (group.length > vehicleSeats && !group.some((userId) => isBiker(guild.members.cache.get(userId)))) {
    return `❌ Le ${maxAgents}e agent part en U2R : au moins un des agents doit être U2R.`;
  }
  return null;
}

/** Passe à l'étape du conducteur, ou termine directement le dispatching s'il n'y a plus d'agent. */
async function continueWithGroup(interaction, session, group, intro) {
  if (!group.length) return finalizeDispatch(interaction, session, []);
  const updated = await AtmSession.findByIdAndUpdate(session._id, { $set: { pendingDispatch: group } }, AFTER);
  return interaction.update(
    await renderSessionPanel(
      updated,
      `${intro}👥 Agents : ${group.map((userId) => `<@${userId}>`).join(', ')}.\nClique sur « Choisir le conducteur » pour terminer le dispatching.`,
    ),
  );
}

/**
 * Enregistre le dispatch final. Les agents remplacés sont retirés de la session (dispatch et disponibles)
 * et la raison de leur remplacement est conservée.
 */
async function finalizeDispatch(interaction, session, agents) {
  const replaced = session.pendingReplacement?.agents ?? [];
  const replacedIds = replaced.map((agent) => agent.userId);
  const dispatch = buildDispatch(interaction.guild, session.creatorId, session.supervisorId, agents);

  const update = {
    $set: {
      dispatch,
      dispatchedAt: session.dispatchedAt ?? new Date(),
      pendingDispatch: [],
      pendingReplacement: null,
      available: session.available.filter((userId) => !replacedIds.includes(userId)),
    },
  };
  if (replaced.length) {
    update.$set.replacements = [
      ...session.replacements.map((entry) => entry.toObject?.() ?? entry),
      ...replaced.map((agent) => ({ userId: agent.userId, reason: agent.reason, by: interaction.user.id, at: new Date() })),
    ];
  }

  const updated = await AtmSession.findOneAndUpdate({ _id: session._id, status: 'pending' }, update, AFTER);
  if (!updated) return interaction.update(await renderSessionPanel(session, STATUS_ERRORS.pending));
  await syncSessionMessage(interaction.client, updated);

  const notice = ['✅ Dispatch mis à jour. Le bouton « Je suis disponible » est désormais inutilisable.'];
  if (replaced.length) {
    notice.push(...replaced.map((agent) => `🔄 <@${agent.userId}> retiré de la session : ${agent.reason}`));
  }
  return interaction.update(await renderSessionPanel(updated, notice.join('\n')));
}

async function handleDispatchModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const candidates = getCandidates(session);
  const selected = interaction.fields.getStringSelectValues(FIELDS.agents).filter((userId) => candidates.includes(userId));
  const error = checkAgentGroup(interaction.guild, session, selected);
  if (error) return interaction.update(await renderSessionPanel(session, error));
  return continueWithGroup(interaction, session, selected, '');
}

/* ------------------------------------------------------------------ */
/* Remplacement d'agents déjà dispatchés                               */
/* ------------------------------------------------------------------ */

/** Modal des raisons : les agents dont la raison est remplie seront remplacés (retirés de la session). */
async function handleReplaceModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const dispatched = getDispatchedAgents(session);
  const toReplace = dispatched
    .map((agent) => {
      const fieldId = `${FIELDS.replacePrefix}${agent.userId}`;
      const reason = interaction.fields.fields.has(fieldId) ? interaction.fields.getTextInputValue(fieldId).trim() : '';
      return { userId: agent.userId, reason };
    })
    .filter((agent) => agent.reason);

  const freeSlots = getAgentSlots(session).maxAgents - dispatched.length;
  if (!toReplace.length && freeSlots <= 0) {
    return interaction.update(
      await renderSessionPanel(session, '❌ Indique la raison du remplacement pour au moins un agent (le dispatch est complet).'),
    );
  }

  const updated = await AtmSession.findByIdAndUpdate(
    session._id,
    { $set: { pendingReplacement: { agents: toReplace }, pendingDispatch: [] } },
    AFTER,
  );
  const lines = toReplace.map((agent) => `🔄 <@${agent.userId}> : ${agent.reason}`);
  return interaction.update(
    await renderSessionPanel(
      updated,
      [
        toReplace.length ? `**Agents à remplacer :**\n${lines.join('\n')}` : '**Aucun agent à remplacer.**',
        'Clique sur « Choisir les remplaçants » pour continuer.',
      ].join('\n'),
    ),
  );
}

/** Agents gardés lors d'un remplacement en cours. */
function getKeptAgents(session) {
  const replacedIds = (session.pendingReplacement?.agents ?? []).map((agent) => agent.userId);
  return getDispatchedAgents(session)
    .map((agent) => agent.userId)
    .filter((userId) => !replacedIds.includes(userId));
}

async function handleReplacePickButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  if (!session.pendingReplacement) {
    return interaction.reply(ephemeralText('❌ Remplacement expiré : recommence avec « Dispatching ».'));
  }

  const kept = getKeptAgents(session);
  const max = getAgentSlots(session).maxAgents - kept.length;
  const candidates = getCandidates(session).slice(0, 25);
  // Personne d'autre n'a voté : les agents remplacés sont simplement retirés.
  if (!candidates.length || max <= 0) {
    const error = checkAgentGroup(interaction.guild, session, kept, { allowEmpty: true });
    if (error) return interaction.update(await renderSessionPanel(session, error));
    return continueWithGroup(interaction, session, kept, "ℹ️ Aucun autre agent disponible : pas de remplaçant.\n");
  }

  const options = candidates.map((userId) => ({ label: agentLabel(interaction.guild, userId), value: userId }));
  return interaction.showModal(buildReplacePickModal(session, options, max));
}

async function handleReplacePickModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  if (!session.pendingReplacement) {
    return interaction.update(await renderSessionPanel(session, '❌ Remplacement expiré : recommence avec « Dispatching ».'));
  }

  const candidates = getCandidates(session);
  const picked = (interaction.fields.fields.get(FIELDS.replacements)?.values ?? []).filter((userId) =>
    candidates.includes(userId),
  );
  const group = [...getKeptAgents(session), ...picked];
  const error = checkAgentGroup(interaction.guild, session, group, { allowEmpty: true });
  if (error) return interaction.update(await renderSessionPanel(session, error));
  return continueWithGroup(interaction, session, group, '');
}

/** Agents en attente de dispatching qui doivent être en moto (au-delà des places du véhicule). */
function needsBiker(session) {
  return session.pendingDispatch.length > getAgentSlots(session).vehicleSeats;
}

async function handleDriverButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  if (!session.pendingDispatch.length) {
    return interaction.reply(ephemeralText('❌ Sélectionne d’abord les agents avec « Dispatching ».'));
  }

  const toOption = (userId) => ({ label: memberName(interaction.guild, userId), value: userId });
  const bikers = needsBiker(session)
    ? session.pendingDispatch.filter((userId) => isBiker(interaction.guild.members.cache.get(userId))).map(toOption)
    : null;
  return interaction.showModal(buildDriverModal(session, session.pendingDispatch.map(toOption), bikers));
}

async function handleDriverModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const pending = session.pendingDispatch;
  const [driverId] = interaction.fields.getStringSelectValues(FIELDS.driver);
  const motoId = interaction.fields.fields.has(FIELDS.moto)
    ? interaction.fields.getStringSelectValues(FIELDS.moto)[0]
    : null;

  let error = null;
  if (!pending.length || !pending.includes(driverId)) error = '❌ Dispatching expiré : recommence avec « Dispatching ».';
  else if (needsBiker(session)) {
    if (!motoId || !pending.includes(motoId) || !isBiker(interaction.guild.members.cache.get(motoId))) {
      error = '❌ Sélectionne un U2R.';
    } else if (motoId === driverId) error = "❌ Le conducteur ne peut pas être l'U2R.";
  }
  if (error) return interaction.update(await renderSessionPanel(session, error));

  // L'U2R est placé en dernier.
  const agents = [...pending.filter((userId) => userId !== motoId), ...(motoId ? [motoId] : [])].map((userId) => ({
    userId,
    driver: userId === driverId,
    moto: userId === motoId,
  }));
  return finalizeDispatch(interaction, session, agents);
}

/* ------------------------------------------------------------------ */
/* Informations (radio, véhicule, tenue)                               */
/* ------------------------------------------------------------------ */

async function handleInfoButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  // Les radios et véhicules utilisés par une autre session à la même heure ne sont pas proposés.
  const choices = getAvailableChoices(await getUsedResources(session.guildId, session.scheduledAt, session._id));
  if (!choices.radios.length) {
    return interaction.reply(ephemeralText('❌ Toutes les radios sont déjà utilisées par une autre session à ce moment-là.'));
  }
  return interaction.showModal(buildSessionInfoModal(session, choices));
}

async function handleInfoModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const { fields } = interaction;
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [vehicleChoice] = fields.getStringSelectValues(FIELDS.vehicle);
  const rawPlate = fields.getTextInputValue(FIELDS.vehicleOther);
  const vehicle = resolveVehicle(vehicleChoice, rawPlate);

  const used = await getUsedResources(session.guildId, session.scheduledAt, session._id);
  const choices = getAvailableChoices(used);

  let error = null;
  if (!isIn(RADIOS, radio) || !isIn(TENUES, tenue) || !isIn(VEHICLES, vehicleChoice)) error = '❌ Réponses invalides.';
  else if (vehicleChoice === VEHICLE_OTHER && getPlateError(rawPlate)) error = getPlateError(rawPlate);
  else if (!isIn(choices.radios, radio) || !isIn(choices.vehicles, vehicleChoice)) {
    error = '❌ Cette radio ou ce véhicule est déjà utilisé par une autre session à ce moment-là.';
  } else if (isVehicleUsed(used, vehicle)) {
    // « Autre » : la plaque saisie ne doit pas être celle d'un véhicule déjà utilisé à ce moment-là.
    error = `❌ La plaque \`${vehicle}\` est déjà utilisée par une autre session à ce moment-là : choisis-en une autre.`;
  }
  if (error) return interaction.update(await renderSessionPanel(session, `${error} Aucune modification enregistrée.`));

  const updated = await AtmSession.findByIdAndUpdate(session._id, { $set: { radio, tenue, vehicle } }, AFTER);
  await syncSessionMessage(interaction.client, updated);
  return interaction.update(await renderSessionPanel(updated, '✅ Informations de la session mises à jour.'));
}

/* ------------------------------------------------------------------ */
/* Commencer / Finir la session                                        */
/* ------------------------------------------------------------------ */

async function handleStartButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  const error = startError(session);
  if (error) return interaction.update(await renderSessionPanel(session, error));
  // Double vérification : tous les agents du dispatch doivent être autour de la table.
  return interaction.update(renderConfirm(session, 'start'));
}

/**
 * Une session peut commencer jusqu'à 10 minutes avant son heure prévue (même si c'est la veille, ex : 23:58
 * pour une session à 00:05) ou après, avec un nombre minimum de personnes sur le dispatch.
 */
function startError(session) {
  const now = Date.now();
  const start = session.scheduledAt.getTime();
  if (now < start) {
    const ts = toUnix(session.scheduledAt);
    if (now < start - START_EARLY_WINDOW) {
      const earliest = toUnix(new Date(start - START_EARLY_WINDOW));
      return `❌ La session peut commencer au plus tôt 10 minutes avant l'heure prévue (<t:${ts}:t>) : à partir de <t:${earliest}:t> (<t:${earliest}:R>).`;
    }
  }
  if (session.dispatch.length >= MIN_DISPATCH) return null;
  return `❌ Il faut au moins ${MIN_DISPATCH} personnes sur le dispatch pour commencer (CO-ATM${session.supervisorId ? ' et superviseur' : ''} compris) : dispatche au moins ${getMinAgents(session)} agent(s).`;
}

/** « Oui, ils sont tous là » : la session commence. */
async function handleStartConfirm(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  const error = startError(session);
  if (error) return interaction.update(await renderSessionPanel(session, error));

  const started = await startSession(interaction.client, session._id);
  if (!started) return interaction.update(await renderSessionPanel(session, STATUS_ERRORS.pending));
  return interaction.update(await renderSessionPanel(started, '▶️ Session commencée.'));
}

async function handleFinishButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'in_progress');
  if (!session) return;
  return interaction.update(renderConfirm(session, 'finish')); // double vérification
}

/** « Oui, terminer la session ». */
async function handleFinishConfirm(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'in_progress');
  if (!session) return;

  await interaction.deferUpdate();
  const finished = await finishSession(interaction.client, session._id);
  if (!finished) return interaction.followUp(ephemeralText(STATUS_ERRORS.in_progress));
  return interaction.editReply(textMessage('🏁 Session terminée.'));
}

/* ------------------------------------------------------------------ */
/* Nouvelle PDS                                                        */
/* ------------------------------------------------------------------ */

async function handlePdsButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'in_progress');
  if (!session) return;
  if (!isCloudinaryEnabled()) {
    return interaction.reply(ephemeralText("❌ Cloudinary n'est pas configuré : impossible d'enregistrer la photo."));
  }
  return interaction.showModal(buildPdsModal(session));
}

async function handlePdsModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'in_progress');
  if (!session) return;

  const mallettes = Number(interaction.fields.getStringSelectValues(FIELDS.mallettes)[0]);
  const [attachment] = getUploadedFiles(interaction, FIELDS.photo);
  if (!Number.isInteger(mallettes) || mallettes < 1 || mallettes > MAX_MALLETTES) {
    return interaction.update(await renderSessionPanel(session, '❌ Nombre de mallettes invalide.'));
  }
  if (!attachment?.contentType?.startsWith('image/')) {
    return interaction.update(await renderSessionPanel(session, "❌ Ajoute une photo (image) de l'emplacement de l'ATM."));
  }

  // L'envoi de la photo sur Cloudinary peut dépasser les 3 secondes accordées par Discord.
  await interaction.deferUpdate();
  try {
    const { message } = await createPds(interaction, session, { mallettes, attachment });
    // Numéro de l'ATM sur la session (le numéro du jour reste affiché sur la PDS elle-même).
    const onSession = await PdsAtm.countDocuments({ sessionId: session._id });
    return interaction.editReply(
      await renderSessionPanel(session, `PDS n°${String(onSession).padStart(2, '0')} posté : ${message.url}`),
    );
  } catch (error) {
    console.error('[PDS] Création impossible :', error);
    return interaction.editReply(await renderSessionPanel(session, `❌ Impossible d'envoyer la PDS : ${error.message}`));
  }
}

module.exports = {
  handleCancelButton,
  handleCancelConfirm,
  handleCancelModal,
  handleBack,
  handleKeepButton,
  handleDispatchButton,
  handleDispatchModal,
  handleReplaceModal,
  handleReplacePickButton,
  handleReplacePickModal,
  handleDriverButton,
  handleDriverModal,
  handleInfoButton,
  handleInfoModal,
  handleStartButton,
  handleStartConfirm,
  handleFinishButton,
  handleFinishConfirm,
  handlePdsButton,
  handlePdsModal,
};
