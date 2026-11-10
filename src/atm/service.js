const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const { renderSessionMessage } = require('./message');
const {
  MAX_PLATE_LENGTH,
  MIN_DISPATCH,
  MIN_POST_DELAY,
  RADIOS,
  SESSION_DURATION,
  VEHICLES,
  VEHICLE_CAPACITY,
  VEHICLE_OTHER,
} = require('./constants');
const { dayKey, getDayBounds, toUnix } = require('../utils/date');

/** Libellé du véhicule à partir de la valeur du menu (ou de la plaque saisie pour « Autre »). */
function resolveVehicle(value, plate) {
  if (value === VEHICLE_OTHER) return plate?.trim() || null;
  return VEHICLES.find((vehicle) => vehicle.value === value)?.label ?? null;
}

/**
 * Vérifie la plaque saisie pour le véhicule « Autre » : 8 caractères maximum, uniquement des lettres,
 * des chiffres et des espaces, et pas uniquement des espaces.
 * @returns {string|null} Le message d'erreur, ou null si la plaque est valide.
 */
function getPlateError(plate) {
  const value = String(plate ?? '');
  if (!value.trim()) {
    return '❌ Tu as choisi « Autre » : renseigne la plaque du véhicule (elle ne peut pas contenir que des espaces).';
  }
  if (value.length > MAX_PLATE_LENGTH || !/^[A-Za-z0-9 ]+$/.test(value)) {
    return `❌ La plaque doit faire ${MAX_PLATE_LENGTH} caractères maximum : lettres, chiffres et espaces uniquement.`;
  }
  return null;
}

/** Mention utilisée quand le ping des agents est activé : rôle employés du .env, sinon @everyone. */
function getPingMention() {
  return config.roles.employees ? `<@&${config.roles.employees}>` : '@everyone';
}

/** Le membre a-t-il ce rôle ? (GuildMember ou membre brut de l'API) */
function hasRole(member, roleId) {
  if (!roleId || !member) return false;
  return Array.isArray(member.roles) ? member.roles.includes(roleId) : Boolean(member.roles?.cache?.has(roleId));
}

/** Le membre a-t-il le rôle CO ATM ? (il n'a alors pas besoin d'être supervisé) */
const isCoAtm = (member) => hasRole(member, config.roles.coAtm);

/** Le créateur du brouillon doit-il choisir un superviseur ? */
function needsSupervisor(guild, draft) {
  return !isCoAtm(guild.members.cache.get(draft.userId));
}

/** Superviseur ayant validé sa présence pour ce brouillon, sinon null. */
function getConfirmedSupervisorId(draft) {
  const request = draft.supervisorRequest;
  return request?.status === 'accepted' && request.supervisorId === draft.supervisorId ? draft.supervisorId : null;
}

/** Le membre a-t-il le rôle Unité 2 roues ? (seul un tel agent peut être en moto) */
const isBiker = (member) => hasRole(member, config.roles.unite2Roues);

/**
 * Agents sur dispatch : n°1 le CO-ATM (créateur), n°2 le superviseur s'il y en a un, puis les agents
 * choisis via « Dispatching ».
 * Logos : 🛡️ CO-ATM, 🧳 superviseur, 🚙 conducteur, 🏍️ motard, 🔫 rôle Fusil à pompe.
 * @param {import('discord.js').Guild} guild
 * @param {{ userId: string, driver?: boolean, moto?: boolean }[]} [agents]
 */
function buildDispatch(guild, creatorId, supervisorId, agents = []) {
  const shotgun = (userId) => (hasRole(guild.members.cache.get(userId), config.roles.fusilAPompe) ? ['pompe'] : []);

  const dispatch = [{ userId: creatorId, roles: ['chef', ...shotgun(creatorId)] }];
  if (supervisorId && supervisorId !== creatorId) {
    dispatch.push({ userId: supervisorId, roles: ['co_atm', ...shotgun(supervisorId)] });
  }
  for (const agent of agents) {
    const roles = [...shotgun(agent.userId)];
    if (agent.driver) roles.push('conducteur');
    if (agent.moto) roles.push('moto');
    dispatch.push({ userId: agent.userId, roles });
  }
  return dispatch;
}

/**
 * Places disponibles pour les agents : le véhicule (CO-ATM et superviseur compris) + 1 en moto.
 * Sans superviseur : 3 dans le véhicule + 1 moto ; avec superviseur : 2 dans le véhicule + 1 moto.
 */
function getAgentSlots(session) {
  const leaders = session.supervisorId ? 2 : 1;
  const vehicleSeats = VEHICLE_CAPACITY - leaders;
  return { vehicleSeats, maxAgents: vehicleSeats + 1 };
}

/** Agents ajoutés via « Dispatching » (hors CO-ATM et superviseur). */
const getDispatchedAgents = (session) =>
  session.dispatch.filter((agent) => agent.userId !== session.creatorId && agent.userId !== session.supervisorId);

/** Seuls le CO-ATM de la session (son créateur) et les membres ayant le rôle Direction peuvent la gérer. */
function canManageSession(interaction, session) {
  return interaction.user.id === session.creatorId || hasRole(interaction.member, config.roles.direction);
}

/**
 * Sessions (en attente ou en cours) prévues aujourd'hui que le membre dirige ou sur lesquelles il est au dispatch.
 * Les sessions terminées ou annulées ne comptent pas.
 * @returns {Promise<{ session: object, leads: boolean }[]>}
 */
async function findTodaySessionsForUser(guildId, userId, now = new Date()) {
  const { start, end } = getDayBounds(now, config.timezone);
  const sessions = await AtmSession.find({ guildId, scheduledAt: { $gte: start, $lt: end } });
  return sessions
    .filter((session) => ['pending', 'in_progress'].includes(session.status) && session.messageId)
    .filter((session) => dayKey(session.scheduledAt, config.timezone) === dayKey(now, config.timezone))
    .filter((session) => session.creatorId === userId || session.dispatch.some((agent) => agent.userId === userId))
    .map((session) => ({ session, leads: session.creatorId === userId }));
}

/** Agents à dispatcher au minimum pour pouvoir commencer (en plus du CO-ATM et du superviseur). */
const getMinAgents = (session) => Math.max(0, MIN_DISPATCH - (session.supervisorId ? 2 : 1));

/** Le membre est-il sur cette session ? (CO-ATM, dispatch ou vote « Je suis disponible ») */
const isInvolved = (session, userId) =>
  session.creatorId === userId ||
  session.dispatch.some((agent) => agent.userId === userId) ||
  session.available.includes(userId);

/**
 * Sessions (en attente ou en cours) sur lesquelles le membre est déjà, et qui chevauchent
 * une session prévue à `scheduledAt` (une session dure environ 1h30).
 */
async function findConflictingSessions(guildId, userId, scheduledAt, excludeId = null) {
  const time = scheduledAt.getTime();
  const sessions = await AtmSession.find({
    guildId,
    scheduledAt: { $gt: new Date(time - SESSION_DURATION), $lt: new Date(time + SESSION_DURATION) },
  });
  return sessions.filter(
    (session) =>
      ['pending', 'in_progress'].includes(session.status) &&
      session.messageId &&
      String(session._id) !== String(excludeId) &&
      isInvolved(session, userId),
  );
}

/**
 * Vérifie la date d'une nouvelle session : au moins 10 minutes après maintenant (il est 7h00 → 7h10 au plus tôt),
 * et pas pendant une autre session du créateur (il peut en prévoir une plus tard).
 * @returns {Promise<string|null>} Le message d'erreur, ou null si la date convient.
 */
async function checkSessionDate(guildId, userId, scheduledAt) {
  const earliest = Math.floor(Date.now() / 60_000) * 60_000 + MIN_POST_DELAY;
  if (scheduledAt.getTime() < earliest) {
    return `❌ Une session doit être postée au moins 10 minutes avant son heure de début : choisis <t:${toUnix(new Date(earliest))}:t> ou plus tard.`;
  }
  const [conflict] = await findConflictingSessions(guildId, userId, scheduledAt);
  if (conflict) {
    return `❌ Tu es déjà sur une session à ce moment-là : ${sessionUrl(conflict)}
Une session dure environ 1h30 : choisis une heure qui ne la chevauche pas.`;
  }
  return null;
}

/** Plaque / nom de véhicule normalisé pour comparer (majuscules, espaces simples). */
const normalizeVehicle = (vehicle) => String(vehicle ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Radios et véhicules déjà utilisés par une session postée (en attente ou en cours) qui chevauche
 * `scheduledAt` (une session dure environ 1h30). `excludeId` : session à ignorer (celle qu'on modifie).
 * @returns {Promise<{ radios: Set<string>, vehicles: Set<string> }>} vehicles : noms normalisés.
 */
async function getUsedResources(guildId, scheduledAt, excludeId = null) {
  const time = scheduledAt.getTime();
  const sessions = await AtmSession.find({
    guildId,
    scheduledAt: { $gt: new Date(time - SESSION_DURATION), $lt: new Date(time + SESSION_DURATION) },
  });
  const active = sessions.filter(
    (session) =>
      ['pending', 'in_progress'].includes(session.status) &&
      session.messageId &&
      String(session._id) !== String(excludeId),
  );
  return {
    radios: new Set(active.map((session) => session.radio)),
    vehicles: new Set(active.map((session) => normalizeVehicle(session.vehicle))),
  };
}

/** Radios et véhicules encore disponibles (« Autre » reste toujours proposé). */
function getAvailableChoices(used) {
  return {
    radios: RADIOS.filter((radio) => !used.radios.has(radio.value)),
    vehicles: VEHICLES.filter(
      (vehicle) => vehicle.value === VEHICLE_OTHER || !used.vehicles.has(normalizeVehicle(vehicle.label)),
    ),
  };
}

/** Le véhicule (libellé ou plaque) est-il déjà utilisé ? */
const isVehicleUsed = (used, vehicle) => Boolean(vehicle) && used.vehicles.has(normalizeVehicle(vehicle));

/** Lien vers le message d'une session. */
const sessionUrl = (session) =>
  `https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}`;

async function fetchAtmChannel(client) {
  const channelId = config.channels.sessionAtm;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`Le salon des sessions ATM (${channelId}) est introuvable ou inaccessible au bot.`);
  }
  return channel;
}

/**
 * Crée la session en base à partir du brouillon de l'aperçu, puis publie le message dans le salon ATM.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('../models/AtmDraft')} draft
 */
async function publishSession(interaction, draft) {
  const channel = await fetchAtmChannel(interaction.client);
  const supervisorId = getConfirmedSupervisorId(draft);

  const session = await AtmSession.create({
    guildId: channel.guildId,
    channelId: channel.id,
    creatorId: draft.userId,
    scheduledAt: draft.scheduledAt,
    tenue: draft.tenue,
    radio: draft.radio,
    vehicle: resolveVehicle(draft.vehicle, draft.plate),
    supervisorId,
    pingMention: draft.ping ? getPingMention() : null,
    dispatch: buildDispatch(interaction.guild, draft.userId, supervisorId),
  });

  try {
    const message = await channel.send(renderSessionMessage(session));
    session.messageId = message.id;
    await session.save();
    return { session, message };
  } catch (error) {
    await session.deleteOne().catch(() => null);
    throw error;
  }
}

async function findSession(id) {
  if (!isValidObjectId(id)) return null;
  return AtmSession.findById(id);
}

/** Met à jour le message public d'une session après une modification. */
async function syncSessionMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId);
  await channel.messages.edit(session.messageId, renderSessionMessage(session));
}

module.exports = {
  resolveVehicle,
  getPlateError,
  getPingMention,
  isCoAtm,
  needsSupervisor,
  getConfirmedSupervisorId,
  hasRole,
  isBiker,
  buildDispatch,
  getAgentSlots,
  getDispatchedAgents,
  getMinAgents,
  findConflictingSessions,
  checkSessionDate,
  getUsedResources,
  getAvailableChoices,
  isVehicleUsed,
  canManageSession,
  findTodaySessionsForUser,
  sessionUrl,
  publishSession,
  findSession,
  syncSessionMessage,
};
