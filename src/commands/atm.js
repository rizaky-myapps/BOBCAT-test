const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const AtmDraft = require('../models/AtmDraft');
const { renderPreview } = require('../atm/preview');
const { findTodaySessionsForUser, sessionUrl } = require('../atm/service');
const { rememberPreview } = require('../atm/supervision');
const { separator } = require('../utils/v2');

/**
 * Affiche l'aperçu de la session (brouillon réutilisé s'il existe), en réponse à la commande
 * ou en remplacement du message d'avertissement (« Poster quand même »).
 */
async function showPreview(interaction) {
  const owner = { guildId: interaction.guildId, userId: interaction.user.id };
  const draft = (await AtmDraft.findOne(owner).sort({ createdAt: -1 })) ?? (await AtmDraft.create(owner));
  const preview = renderPreview(draft, interaction.guild);

  if (interaction.isMessageComponent()) await interaction.update(preview);
  else await interaction.reply({ ...preview, flags: preview.flags | MessageFlags.Ephemeral });
  rememberPreview(interaction, draft);
}

/** Message affiché quand le membre dirige ou participe déjà à une session aujourd'hui. */
function renderAlreadyBusy(sessions) {
  const lines = sessions.map(({ session, leads }) =>
    leads
      ? `🛡️ Tu diriges déjà une session aujourd'hui : ${sessionUrl(session)}`
      : `👥 Tu participes déjà à une session aujourd'hui : ${sessionUrl(session)}`,
  );
  lines.push('', 'Tu peux quand même en poster une nouvelle avec le bouton ci-dessous.');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('atm:force')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📨')
          .setLabel('Poster quand même'),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [separator(), container, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atm')
    .setDescription("Créer une session de ravitaillement d'ATM")
    .setContexts(InteractionContextType.Guild),

  /**
   * Envoie l'aperçu (éphémère) du message de session, configurable via ses boutons.
   * Si le membre dirige ou participe déjà à une session aujourd'hui, il en est d'abord informé.
   */
  async execute(interaction) {
    const sessions = await findTodaySessionsForUser(interaction.guildId, interaction.user.id);
    if (sessions.length) return interaction.reply(renderAlreadyBusy(sessions));
    return showPreview(interaction);
  },

  /** Bouton « Poster quand même ». */
  showPreview,
};
