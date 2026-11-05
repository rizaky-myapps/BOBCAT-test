const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const { renderSessionMessage } = require('./message');
const { VEHICLES, VEHICLE_CAPACITY, VEHICLE_OTHER } = require('./constants');
const { dayKey, getDayBounds } = require('../utils/date');

/** Libellé du véhicule à partir de la valeur du menu (ou de la plaque saisie pour « Autre »). */
function resolveVehicle(value, plate) {
  if (value === VEHICLE_OTHER) return plate?.trim() || null;
  return VEHICLES.find((vehicle) => vehicle.value === value)?.label ?? null;
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
 * Sessions (non annulées) prévues aujourd'hui que le membre dirige ou sur lesquelles il est au dispatch.
 * @returns {Promise<{ session: object, leads: boolean }[]>}
 */
async function findTodaySessionsForUser(guildId, userId, now = new Date()) {
  const { start, end } = getDayBounds(now, config.timezone);
  const sessions = await AtmSession.find({ guildId, scheduledAt: { $gte: start, $lt: end } });
  return sessions
    .filter((session) => session.status !== 'cancelled' && session.messageId)
    .filter((session) => dayKey(session.scheduledAt, config.timezone) === dayKey(now, config.timezone))
    .filter((session) => session.creatorId === userId || session.dispatch.some((agent) => agent.userId === userId))
    .map((session) => ({ session, leads: session.creatorId === userId }));
}

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
  getPingMention,
  isCoAtm,
  needsSupervisor,
  getConfirmedSupervisorId,
  hasRole,
  isBiker,
  buildDispatch,
  getAgentSlots,
  getDispatchedAgents,
  canManageSession,
  findTodaySessionsForUser,
  sessionUrl,
  publishSession,
  findSession,
  syncSessionMessage,
};
