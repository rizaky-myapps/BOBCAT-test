const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const { buildCreateModal } = require('../atm/modals');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atm')
    .setDescription("Créer une session de ravitaillement d'ATM")
    .setContexts(InteractionContextType.Guild),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    await interaction.showModal(buildCreateModal());
  },
};
