const {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const PdsAtm = require('../models/PdsAtm');
const { canManageSession, findSession } = require('../atm/service');
const { ephemeralText, separator } = require('../utils/v2');

module.exports = {
  /** Clic droit sur le message d'une PDS → Applications → « Supprimer la PDS ». */
  data: new ContextMenuCommandBuilder()
    .setName('Supprimer la PDS')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),

  /**
   * Demande confirmation avant de supprimer la PDS (base de données, photo Cloudinary et message).
   * Réservé au CO-ATM de la session et à la direction.
   * @param {import('discord.js').MessageContextMenuCommandInteraction} interaction
   */
  async execute(interaction) {
    const pds = await PdsAtm.findOne({ messageId: interaction.targetId });
    if (!pds) return interaction.reply(ephemeralText("❌ Ce message n'est pas une PDS ATM."));

    const session = await findSession(String(pds.sessionId));
    if (session && !canManageSession(interaction, session)) {
      return interaction.reply(ephemeralText('⛔ Seuls le CO-ATM de la session et la direction peuvent supprimer cette PDS.'));
    }

    const number = String(pds.number).padStart(2, '0');
    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ⚠️ Supprimer la PDS n°${number} ?\nLa PDS, sa photo et son message seront supprimés définitivement.`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`pds:del:${pds._id}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setLabel('Oui, supprimer la PDS'),
          new ButtonBuilder().setCustomId('pds:delno').setStyle(ButtonStyle.Secondary).setEmoji('↩️').setLabel('Annuler'),
        ),
      );

    return interaction.reply({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [separator(), container, separator()],
      allowedMentions: { parse: [] },
    });
  },
};
