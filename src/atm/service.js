const { PermissionFlagsBits } = require('discord.js');
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

/** Mention utilisée quand le ping des agents est activé : rôle du .env, sinon @everyone. */
function getPingMention() {
  return config.atm.pingRoleId ? `<@&${config.atm.pingRoleId}>` : '@everyone';
}

async function fetchAtmChannel(client) {
  const channel = await client.channels.fetch(config.atm.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`Le salon ATM (${config.atm.channelId}) est introuvable ou inaccessible au bot.`);
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
    creatorId: interaction.user.id,
    scheduledAt: draft.scheduledAt,
    tenue: draft.tenue,
    radio: draft.radio,
    vehicle: resolveVehicle(draft.vehicle, draft.plate),
    supervisorId: draft.supervisorId,
    pingMention: draft.ping ? getPingMention() : null,
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

/** Met à jour le message public d'une session après une modification. */
async function syncSessionMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId);
  await channel.messages.edit(session.messageId, renderSessionMessage(session));
}

/**
 * Le membre peut-il gérer la session ? (créateur, permission « Gérer le serveur »,
 * ou rôle listé dans ATM_MANAGER_ROLE_IDS)
 */
function canManageSession(interaction, session) {
  if (interaction.user.id === session.creatorId) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const roles = interaction.member?.roles;
  const roleIds = Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
  return config.atm.managerRoleIds.some((roleId) => roleIds.includes(roleId));
}

async function findSession(id) {
  if (!isValidObjectId(id)) return null;
  return AtmSession.findById(id);
}

module.exports = {
  resolveVehicle,
  getPingMention,
  publishSession,
  syncSessionMessage,
  canManageSession,
  findSession,
};
