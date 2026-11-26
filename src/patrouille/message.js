const { ContainerBuilder, MessageFlags, TextDisplayBuilder } = require('discord.js');
const { config } = require('../config');
const { formatAgentName } = require('../atm/pds');
const { getMatricule } = require('./agents');
const { separator } = require('../utils/v2');

/** Salon PDS patrouille (BOBCAT_PDS_PATROUILLE_CHANNEL_ID). */
async function fetchPatrolChannel(client) {
  const channelId = config.channels.pdsPatrouille;
  if (!channelId) throw new Error("le salon PDS patrouille n'est pas configuré (`BOBCAT_PDS_PATROUILLE_CHANNEL_ID` dans le .env)");
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`le salon PDS patrouille (${channelId}) est introuvable ou inaccessible au bot`);
  }
  return channel;
}

/** Nom d'un membre d'après son surnom sur le serveur (« [22] • Yvick Waler »), à défaut sa mention. */
const memberName = (guild, userId) => {
  const member = guild.members.cache.get(userId);
  return member ? formatAgentName(member.displayName) : `<@${userId}>`;
};

/** Ordre des agents : le 69 en premier, puis par matricule (comme dans le modal). */
const rank = (guild, userId) => {
  const member = guild.members.cache.get(userId);
  const matricule = member ? getMatricule(member) : null;
  if (matricule === null) return Infinity;
  return matricule === 69 ? 1 : matricule;
};

/**
 * Message de la patrouille dans le salon PDS patrouille : nom de la patrouille et agents sélectionnés
 * (texte, sans mention).
 */
function renderPatrolMessage(guild, name, issuerId, agentIds) {
  const agents = [...agentIds].sort((a, b) => rank(guild, a) - rank(guild, b));
  const content = [
    `## Patrouille ${name}`,
    '**Agents :**',
    agents.length ? agents.map((userId) => `> - ${memberName(guild, userId)}`).join('\n') : '> Aucun agent sélectionné.',
    `-# Envoyée par ${memberName(guild, issuerId)}`,
  ].join('\n');

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content)), separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { fetchPatrolChannel, renderPatrolMessage };
