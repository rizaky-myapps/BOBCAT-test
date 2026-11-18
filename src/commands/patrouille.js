const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const { config } = require('../config');
const { getAgentLists } = require('../patrouille/agents');
const { buildPatrolModal } = require('../patrouille/modal');
const { ephemeralText } = require('../utils/v2');
const EMOJI = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('patrouille')
    .setDescription('Créer une patrouille')
    .setContexts(InteractionContextType.Guild),

  /** Ouvre le modal : nom de la patrouille et agents (employés ayant un matricule, sauf l'émetteur). */
  async execute(interaction) {
    if (!config.roles.employees) {
      return interaction.reply(
        ephemeralText(`${EMOJI.ERREUR} Le rôle employés n'est pas configuré (\`BOBCAT_EMPLOYEES_ROLE_ID\` dans le .env).`),
      );
    }
    return interaction.showModal(buildPatrolModal(getAgentLists(interaction.guild, interaction.user.id)));
  },
};
