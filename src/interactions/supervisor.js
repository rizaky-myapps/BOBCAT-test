const { isValidObjectId } = require('mongoose');
const AtmDraft = require('../models/AtmDraft');
const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { FIELDS } = require('../atm/modals');
const { notifyResolution, renderSupervisionRequest, resolveRequest } = require('../atm/supervision');
const { ephemeralText } = require('../utils/v2');

/** Soumission du modal /superviseur : la sélection devient la liste des superviseurs en base. */
async function handleSupervisorModal(interaction) {
  const { guild, guildId } = interaction;
  const roleId = config.roles.coAtm;
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

/**
 * Boutons « Je suis disponible » / « Pas disponible » du message CO-ATM.
 * Seul le superviseur sollicité peut répondre ; au-delà de 10 minutes, la demande est refusée.
 */
async function handleSupervisorAnswer(interaction, [draftId, requestId], answer) {
  const draft = isValidObjectId(draftId) ? await AtmDraft.findById(draftId) : null;
  const request = draft?.supervisorRequest;
  if (!request || request.id !== requestId || request.status !== 'pending') {
    return interaction.reply(ephemeralText("ℹ️ Cette demande de supervision n'est plus d'actualité."));
  }
  if (interaction.user.id !== request.supervisorId) {
    return interaction.reply(ephemeralText('⛔ Seul le superviseur sollicité peut répondre à cette demande.'));
  }

  const status = request.expiresAt <= new Date() ? 'expired' : answer;
  const updated = await resolveRequest(draft._id, requestId, status);
  if (!updated) return interaction.reply(ephemeralText("ℹ️ Cette demande de supervision n'est plus d'actualité."));

  await interaction.update(renderSupervisionRequest(draft, updated.supervisorRequest));
  await notifyResolution(interaction.client, updated);
}

const handleSupervisorAccept = (interaction, args) => handleSupervisorAnswer(interaction, args, 'accepted');
const handleSupervisorRefuse = (interaction, args) => handleSupervisorAnswer(interaction, args, 'refused');

module.exports = { handleSupervisorModal, handleSupervisorAccept, handleSupervisorRefuse };
