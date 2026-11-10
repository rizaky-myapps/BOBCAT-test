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
const { findProgrammedSessions, findTodaySessionsForUser, sessionUrl } = require('../atm/service');
const { config } = require('../config');
const { formatDateTime, toUnix } = require('../utils/date');
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

/**
 * Message affiché avant l'aperçu quand le membre a des sessions programmées (avec « Déprogrammer » et
 * « Nouvelle session ») ou dirige / participe déjà à une session aujourd'hui (avec « Poster quand même »).
 */
function renderBeforePreview(programmed, today) {
  const lines = [];
  for (const session of programmed) {
    const ts = toUnix(session.scheduledAt);
    const publish = toUnix(session.publishAt);
    lines.push(
      `📅 Ta session programmée du <t:${ts}:d> à <t:${ts}:t> sera postée <t:${publish}:R> (à <t:${publish}:t>).`,
    );
  }
  for (const { session, leads } of today) {
    lines.push(
      leads
        ? `🛡️ Tu diriges déjà une session aujourd'hui : ${sessionUrl(session)}`
        : `👥 Tu participes déjà à une session aujourd'hui : ${sessionUrl(session)}`,
    );
  }
  lines.push(
    '',
    programmed.length
      ? 'Tu peux déprogrammer une session (elle ne sera jamais postée) ou en programmer une nouvelle, à une heure qui ne chevauche pas tes sessions (une session dure environ 1h30).'
      : 'Tu peux quand même en poster une nouvelle avec le bouton ci-dessous, à une heure qui ne chevauche pas tes sessions (une session dure environ 1h30).',
  );

  const buttons = programmed.slice(0, 4).map((session) =>
    new ButtonBuilder()
      .setCustomId(`atm:unprog:${session._id}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setLabel(programmed.length > 1 ? `Déprogrammer (${formatDateTime(session.scheduledAt, config.timezone)})` : 'Déprogrammer'),
  );
  buttons.push(
    new ButtonBuilder()
      .setCustomId('atm:force')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📨')
      .setLabel(programmed.length ? 'Nouvelle session' : 'Poster quand même'),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

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
   * Si le membre a des sessions programmées, ou dirige / participe déjà à une session aujourd'hui,
   * il en est d'abord informé.
   */
  async execute(interaction) {
    const [programmed, today] = await Promise.all([
      findProgrammedSessions(interaction.guildId, interaction.user.id),
      findTodaySessionsForUser(interaction.guildId, interaction.user.id),
    ]);
    if (programmed.length || today.length) return interaction.reply(renderBeforePreview(programmed, today));
    return showPreview(interaction);
  },

  /** Bouton « Poster quand même ». */
  showPreview,
};
