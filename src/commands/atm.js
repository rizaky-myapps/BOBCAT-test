const { InteractionContextType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const AtmDraft = require('../models/AtmDraft');
const { renderPreview } = require('../atm/preview');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atm')
    .setDescription("Créer une session de ravitaillement d'ATM")
    .setContexts(InteractionContextType.Guild),

  /** Envoie l'aperçu (éphémère) du message de session, configurable via ses boutons. */
  async execute(interaction) {
    const draft = await AtmDraft.create({ guildId: interaction.guildId, userId: interaction.user.id });
    const preview = renderPreview(draft);
    await interaction.reply({ ...preview, flags: preview.flags | MessageFlags.Ephemeral });
  },
};
