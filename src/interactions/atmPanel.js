const AtmSession = require('../models/AtmSession');
const { CANCEL_OTHER, CANCEL_REASONS, MAX_MALLETTES, MIN_DISPATCH, RADIOS, TENUES, VEHICLES } = require('../atm/constants');
const { cancelSession, finishSession, startSession } = require('../atm/lifecycle');
const { FIELDS, getUploadedFiles, truncate } = require('../atm/modals');
const { renderSessionPanel } = require('../atm/panel');
const { createPds } = require('../atm/pds');
const {
  buildCancelModal,
  buildDispatchModal,
  buildDriverModal,
  buildPdsModal,
  buildSessionInfoModal,
} = require('../atm/sessionModals');
const {
  buildDispatch,
  canManageSession,
  findSession,
  getAgentSlots,
  getDispatchedAgents,
  getMinAgents,
  isBiker,
  resolveVehicle,
  syncSessionMessage,
} = require('../atm/service');
const { renderStartCheck } = require('../atm/startCheck');
const { isCloudinaryEnabled } = require('../services/cloudinary');
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

/* ------------------------------------------------------------------ */
/* Annuler (panneau ⚙️ ou question du salon CO-ATM)                    */
/* ------------------------------------------------------------------ */

async function handleCancelButton(interaction, [id, source = 'panel']) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  return interaction.showModal(buildCancelModal(session, source));
}

async function handleCancelModal(interaction, [id, source = 'panel']) {
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

  // Depuis le panneau : il est remplacé. Depuis le salon CO-ATM : la question a été mise à jour.
  if (source === 'panel') return interaction.editReply(textMessage('🛑 Session annulée.'));
  return interaction.followUp(ephemeralText('🛑 Session annulée.'));
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

  const onDispatch = new Set(getDispatchedAgents(session).map((agent) => agent.userId));
  const voters = session.available
    .filter((userId) => userId !== session.creatorId && userId !== session.supervisorId)
    .slice(0, 25);
  if (!voters.length) {
    return interaction.reply(ephemeralText("❌ Aucun agent n'a voté « Je suis disponible » sur cette session."));
  }

  const options = voters.map((userId) => ({
    label: memberName(interaction.guild, userId),
    value: userId,
    default: onDispatch.has(userId),
  }));
  return interaction.showModal(buildDispatchModal(session, options, getAgentSlots(session)));
}

async function handleDispatchModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const { vehicleSeats, maxAgents } = getAgentSlots(session);
  const selected = interaction.fields.getStringSelectValues(FIELDS.agents).filter((userId) => session.available.includes(userId));

  let error = null;
  if (!selected.length || selected.length > maxAgents) error = `❌ Sélectionne entre 1 et ${maxAgents} agents.`;
  else if (selected.length > vehicleSeats && !selected.some((userId) => isBiker(interaction.guild.members.cache.get(userId)))) {
    error = `❌ Le ${maxAgents}e agent part en moto : au moins un des agents sélectionnés doit avoir le rôle Unité 2 roues.`;
  }
  if (error) return interaction.update(renderSessionPanel(session, error));

  const updated = await AtmSession.findByIdAndUpdate(session._id, { $set: { pendingDispatch: selected } }, AFTER);
  return interaction.update(
    renderSessionPanel(
      updated,
      `👥 Agents sélectionnés : ${selected.map((userId) => `<@${userId}>`).join(', ')}.\nClique sur « Choisir le conducteur » pour terminer le dispatching.`,
    ),
  );
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
      error = '❌ Sélectionne un motard ayant le rôle Unité 2 roues.';
    } else if (motoId === driverId) error = '❌ Le conducteur ne peut pas être le motard.';
  }
  if (error) return interaction.update(renderSessionPanel(session, error));

  // Le motard est placé en dernier.
  const agents = [...pending.filter((userId) => userId !== motoId), ...(motoId ? [motoId] : [])].map((userId) => ({
    userId,
    driver: userId === driverId,
    moto: userId === motoId,
  }));
  const dispatch = buildDispatch(interaction.guild, session.creatorId, session.supervisorId, agents);

  const updated = await AtmSession.findOneAndUpdate(
    { _id: session._id, status: 'pending' },
    { $set: { dispatch, dispatchedAt: new Date(), pendingDispatch: [] } },
    AFTER,
  );
  if (!updated) return interaction.update(renderSessionPanel(session, STATUS_ERRORS.pending));
  await syncSessionMessage(interaction.client, updated);
  return interaction.update(
    renderSessionPanel(updated, '✅ Dispatch mis à jour. Le bouton « Je suis disponible » est désormais inutilisable.'),
  );
}

/* ------------------------------------------------------------------ */
/* Informations (radio, véhicule, tenue)                               */
/* ------------------------------------------------------------------ */

async function handleInfoButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  return interaction.showModal(buildSessionInfoModal(session));
}

async function handleInfoModal(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;

  const { fields } = interaction;
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [vehicleChoice] = fields.getStringSelectValues(FIELDS.vehicle);
  const vehicle = resolveVehicle(vehicleChoice, fields.getTextInputValue(FIELDS.vehicleOther));

  let error = null;
  if (!isIn(RADIOS, radio) || !isIn(TENUES, tenue) || !isIn(VEHICLES, vehicleChoice)) error = '❌ Réponses invalides.';
  else if (!vehicle) error = '❌ Tu as choisi « Autre » : renseigne la plaque du véhicule.';
  if (error) return interaction.update(renderSessionPanel(session, `${error} Aucune modification enregistrée.`));

  const updated = await AtmSession.findByIdAndUpdate(session._id, { $set: { radio, tenue, vehicle } }, AFTER);
  await syncSessionMessage(interaction.client, updated);
  return interaction.update(renderSessionPanel(updated, '✅ Informations de la session mises à jour.'));
}

/* ------------------------------------------------------------------ */
/* Commencer / Finir la session                                        */
/* ------------------------------------------------------------------ */

async function handleStartButton(interaction, [id]) {
  const session = await loadManageable(interaction, id, 'pending');
  if (!session) return;
  if (session.dispatch.length < MIN_DISPATCH) {
    return interaction.update(
      renderSessionPanel(
        session,
        `❌ Il faut au moins ${MIN_DISPATCH} personnes sur le dispatch pour commencer (CO-ATM${session.supervisorId ? ' et superviseur' : ''} compris) : dispatche au moins ${getMinAgents(session)} agent(s).`,
      ),
    );
  }

  const started = await startSession(interaction.client, session._id);
  if (!started) return interaction.update(renderSessionPanel(session, STATUS_ERRORS.pending));
  return interaction.update(renderSessionPanel(started, '▶️ Session commencée.'));
}

async function handleFinishButton(interaction, [id]) {
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
    return interaction.update(renderSessionPanel(session, '❌ Nombre de mallettes invalide.'));
  }
  if (!attachment?.contentType?.startsWith('image/')) {
    return interaction.update(renderSessionPanel(session, "❌ Ajoute une photo (image) de l'emplacement de l'ATM."));
  }

  // L'envoi de la photo sur Cloudinary peut dépasser les 3 secondes accordées par Discord.
  await interaction.deferUpdate();
  try {
    const { pds, message } = await createPds(interaction, session, { mallettes, attachment });
    return interaction.editReply(
      renderSessionPanel(session, `📦 PDS n°${String(pds.number).padStart(2, '0')} envoyée : ${message.url}`),
    );
  } catch (error) {
    console.error('[PDS] Création impossible :', error);
    return interaction.editReply(renderSessionPanel(session, `❌ Impossible d'envoyer la PDS : ${error.message}`));
  }
}

module.exports = {
  handleCancelButton,
  handleCancelModal,
  handleKeepButton,
  handleDispatchButton,
  handleDispatchModal,
  handleDriverButton,
  handleDriverModal,
  handleInfoButton,
  handleInfoModal,
  handleStartButton,
  handleFinishButton,
  handlePdsButton,
  handlePdsModal,
};
