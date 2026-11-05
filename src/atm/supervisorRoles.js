const { RESTJSONErrorCodes } = require('discord.js');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { SUPERVISOR_ROLE_GRACE } = require('./constants');
const { sendLog } = require('../utils/logs');

/** Membre du serveur, ou null s'il l'a quitté. Renvoie undefined si on ne peut pas savoir. */
async function resolveMember(guild, userId) {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if ([RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser].includes(error.code)) return null;
    return undefined;
  }
}

/**
 * Retire de la liste les superviseurs qui n'ont plus le rôle CO ATM depuis 1h (appelé régulièrement).
 * S'il récupère le rôle avant, le superviseur reste dans la liste.
 */
async function checkSupervisorRoles(client) {
  const roleId = config.roles.coAtm;
  if (!roleId) return;

  for (const supervisor of await Supervisor.find({})) {
    const guild = client.guilds.cache.get(supervisor.guildId);
    if (!guild) continue;

    const member = await resolveMember(guild, supervisor.userId);
    if (member === undefined) continue;

    if (member?.roles.cache.has(roleId)) {
      if (supervisor.roleLostAt) await Supervisor.findByIdAndUpdate(supervisor._id, { $set: { roleLostAt: null } });
      continue;
    }

    if (!supervisor.roleLostAt) {
      await Supervisor.findByIdAndUpdate(supervisor._id, { $set: { roleLostAt: new Date() } });
      continue;
    }

    if (Date.now() - supervisor.roleLostAt.getTime() >= SUPERVISOR_ROLE_GRACE) {
      await Supervisor.deleteOne({ _id: supervisor._id });
      const name = member?.displayName ?? supervisor.name;
      await sendLog(
        client,
        `📋 **Liste des superviseurs**\n<@${supervisor.userId}>${name ? ` (${name})` : ''} ne fait plus partie de la liste des superviseurs : il n'a plus le rôle CO-ATM.`,
      );
    }
  }
}

module.exports = { checkSupervisorRoles };
