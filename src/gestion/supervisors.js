const Supervisor = require('../models/Supervisor');
const { config } = require('../config');
const { buildSupervisorModal, truncate } = require('../atm/modals');
const { ephemeralText } = require('../utils/v2');
const EMOJI = require('../emoji');

/** Nombre maximum d'options d'un menu de sélection Discord. */
const MAX_OPTIONS = 25;

/**
 * Bouton « Superviseur ATM » de /gestion (remplace la commande /superviseur) : ouvre un modal listant
 * les membres ayant le rôle CO ATM défini dans le .env. La sélection devient la liste des superviseurs.
 */
async function openSupervisorModal(interaction) {
  const roleId = config.roles.coAtm;
  if (!roleId) {
    return interaction.reply(
      ephemeralText(`${EMOJI.ERREUR} Le rôle CO ATM n'est pas configuré (\`BOBCAT_CO_ATM_ROLE_ID\` dans le .env).`),
    );
  }

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Le rôle CO ATM configuré est introuvable sur ce serveur.`));

  const current = await Supervisor.find({ guildId: interaction.guildId });
  const currentIds = new Set(current.map((supervisor) => supervisor.userId));

  // Les superviseurs déjà enregistrés en premier, puis par ordre alphabétique.
  const members = [...role.members.filter((member) => !member.user.bot).values()]
    .sort(
      (a, b) =>
        Number(currentIds.has(b.id)) - Number(currentIds.has(a.id)) ||
        a.displayName.localeCompare(b.displayName, 'fr'),
    )
    .slice(0, MAX_OPTIONS);

  if (!members.length) {
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Aucun membre n'a le rôle ${role}.`));
  }

  const options = members.map((member) => ({
    label: truncate(member.displayName, 100),
    value: member.id,
    description: truncate(`@${member.user.username}`, 100),
    default: currentIds.has(member.id),
  }));

  return interaction.showModal(buildSupervisorModal(options, role.name));
}

module.exports = { openSupervisorModal };
