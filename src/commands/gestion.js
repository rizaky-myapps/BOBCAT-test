const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const { renderGestionMenu } = require('../gestion/menu');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gestion')
    .setDescription('Lieux de patrouille, véhicules, superviseurs ATM, séparateurs et agents UPR')
    .setContexts(InteractionContextType.Guild),

  /** Affiche le message de gestion (5 boutons). */
  async execute(interaction) {
    return interaction.reply(renderGestionMenu());
  },
};
