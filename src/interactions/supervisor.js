const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { FIELDS } = require('../atm/modals');
const { ephemeralText } = require('../utils/v2');

/** Soumission du modal /superviseur : la sélection devient la liste des superviseurs en base. */
async function handleSupervisorModal(interaction) {
  const { guild, guildId } = interaction;
  const roleId = config.atm.supervisorRoleId;
  const selected = interaction.fields.fields.get(FIELDS.supervisors)?.values ?? [];

  const members = selected
    .map((userId) => guild.members.cache.get(userId))
    .filter((member) => member && (!roleId || member.roles.cache.has(roleId)));

  await Supervisor.deleteMany({ guildId, userId: { $nin: members.map((member) => member.id) } });
  if (members.length) {
    await Supervisor.bulkWrite(
      members.map((member) => ({
        updateOne: {
          filter: { guildId, userId: member.id },
          update: { $set: { name: member.displayName } },
          upsert: true,
        },
      })),
    );
  }

  return interaction.reply(
    ephemeralText(
      members.length
        ? `✅ **Superviseurs enregistrés (${members.length}) :**\n${members.map((m) => `> - <@${m.id}>`).join('\n')}`
        : '✅ Aucun superviseur sélectionné : la liste des superviseurs est vide.',
    ),
  );
}

module.exports = { handleSupervisorModal };
