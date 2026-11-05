const { InteractionContextType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const AtmDraft = require('../models/AtmDraft');
const { renderPreview } = require('../atm/preview');
const { rememberPreview } = require('../atm/supervision');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atm')
    .setDescription("Créer une session de ravitaillement d'ATM")
    .setContexts(InteractionContextType.Guild),

  /**
   * Envoie l'aperçu (éphémère) du message de session, configurable via ses boutons.
   * Si l'utilisateur a déjà un brouillon, il est réutilisé.
   */
  async execute(interaction) {
    const owner = { guildId: interaction.guildId, userId: interaction.user.id };
    const draft = (await AtmDraft.findOne(owner).sort({ createdAt: -1 })) ?? (await AtmDraft.create(owner));
    const preview = renderPreview(draft, interaction.guild);
    await interaction.reply({ ...preview, flags: preview.flags | MessageFlags.Ephemeral });
    rememberPreview(interaction, draft);
  },
};
