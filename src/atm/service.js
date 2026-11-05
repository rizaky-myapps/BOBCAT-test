const { PermissionFlagsBits } = require('discord.js');
const { isValidObjectId } = require('mongoose');
const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const { renderSessionMessage } = require('./message');
const { VEHICLES, VEHICLE_OTHER } = require('./constants');

/** Libellé du véhicule à partir de la valeur du menu (ou du texte libre pour « Autre »). */
function resolveVehicle(value, otherText) {
  if (value === VEHICLE_OTHER) return otherText?.trim() || null;
  return VEHICLES.find((vehicle) => vehicle.value === value)?.label ?? null;
}

async function fetchAtmChannel(client) {
  const channel = await client.channels.fetch(config.atm.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`Le salon ATM (${config.atm.channelId}) est introuvable ou inaccessible au bot.`);
  }
  return channel;
}

/**
 * Crée la session en base puis publie le message dans le salon ATM.
 * @returns {Promise<{ session: import('mongoose').Document, message: import('discord.js').Message }>}
 */
async function publishSession(interaction, { scheduledAt, tenue, radio, vehicle, ping }) {
  const channel = await fetchAtmChannel(interaction.client);

  let pingMention = null;
  let allowedMentions = { parse: [] };
  if (ping === 'oui') {
    if (config.atm.pingRoleId) {
      pingMention = `<@&${config.atm.pingRoleId}>`;
      allowedMentions = { roles: [config.atm.pingRoleId] };
    } else {
      pingMention = '@everyone';
      allowedMentions = { parse: ['everyone'] };
    }
  }

  const session = await AtmSession.create({
    guildId: channel.guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    scheduledAt,
    tenue,
    radio,
    vehicle,
    pingMention,
  });

  try {
    const message = await channel.send({ ...renderSessionMessage(session), allowedMentions });
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
  await channel.messages.edit(session.messageId, {
    ...renderSessionMessage(session),
    allowedMentions: { parse: [] },
  });
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
  publishSession,
  syncSessionMessage,
  canManageSession,
  findSession,
};
