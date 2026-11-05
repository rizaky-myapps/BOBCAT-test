const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const { renderSessionMessage } = require('./message');
const { VEHICLES, VEHICLE_OTHER } = require('./constants');

/** Libellé du véhicule à partir de la valeur du menu (ou de la plaque saisie pour « Autre »). */
function resolveVehicle(value, plate) {
  if (value === VEHICLE_OTHER) return plate?.trim() || null;
  return VEHICLES.find((vehicle) => vehicle.value === value)?.label ?? null;
}

/** Mention utilisée quand le ping des agents est activé : rôle employés du .env, sinon @everyone. */
function getPingMention() {
  return config.roles.employees ? `<@&${config.roles.employees}>` : '@everyone';
}

/**
 * Logos d'un agent d'après ses rôles :
 * 🛡️ chef d'opération (créateur de la session), 🧳 rôle CO ATM, 🔫 rôle Fusil à pompe.
 */
function getAgentRoles(member, { isLeader = false } = {}) {
  const has = (roleId) => Boolean(roleId && member?.roles.cache.has(roleId));
  const roles = [];
  if (isLeader) roles.push('chef');
  if (has(config.roles.coAtm)) roles.push('co_atm');
  if (has(config.roles.fusilAPompe)) roles.push('pompe');
  return roles;
}

/**
 * Agents sur dispatch : n°1 le créateur, n°2 le superviseur s'il y en a un.
 * Les places n°3 et n°4 restent à définir une fois la session postée.
 * @param {import('discord.js').Guild} guild
 */
function buildDispatch(guild, creatorId, supervisorId) {
  const dispatch = [{ userId: creatorId, roles: getAgentRoles(guild.members.cache.get(creatorId), { isLeader: true }) }];
  if (supervisorId && supervisorId !== creatorId) {
    dispatch.push({ userId: supervisorId, roles: getAgentRoles(guild.members.cache.get(supervisorId)) });
  }
  return dispatch;
}

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

  const session = await AtmSession.create({
    guildId: channel.guildId,
    channelId: channel.id,
    creatorId: draft.userId,
    scheduledAt: draft.scheduledAt,
    tenue: draft.tenue,
    radio: draft.radio,
    vehicle: resolveVehicle(draft.vehicle, draft.plate),
    supervisorId: draft.supervisorId,
    pingMention: draft.ping ? getPingMention() : null,
    dispatch: buildDispatch(interaction.guild, draft.userId, draft.supervisorId),
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

module.exports = {
  resolveVehicle,
  getPingMention,
  buildDispatch,
  publishSession,
  findSession,
};
