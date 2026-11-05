const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const { DISPATCH_MAX, MAX_PHOTOS, STATUSES, findLabel } = require('./constants');
const { isCloudinaryEnabled } = require('../services/cloudinary');
const { toUnix } = require('../utils/date');

/**
 * Panneau de gestion (éphémère) ouvert par le bouton ⚙️ d'une session.
 * @param {import('../models/AtmSession')} session
 * @param {string} [notice] Message de retour affiché en bas du résumé.
 */
function renderPanel(session, notice) {
  const id = session._id.toString();
  const ts = toUnix(session.scheduledAt);
  const messageUrl = `https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}`;

  const summary = [
    '## ⚙️ Gestion de la session ATM',
    `> **Date :** <t:${ts}:F> (<t:${ts}:R>)`,
    `> **Statut :** \`${findLabel(STATUSES, session.status)}\``,
    `> **Disponibles :** ${session.available.length} · **Sur dispatch :** ${session.dispatch.length}/${DISPATCH_MAX}`,
    `> **Photos :** ${session.photos.length}/${MAX_PHOTOS}`,
    `> [Voir l'annonce](${messageUrl})`,
  ];
  if (notice) summary.push('', notice);

  const dispatchSelect = new UserSelectMenuBuilder()
    .setCustomId(`atm:dispatch:${id}`)
    .setPlaceholder(`Agents sur dispatch (${DISPATCH_MAX} max)`)
    .setMinValues(0)
    .setMaxValues(DISPATCH_MAX);
  if (session.dispatch.length) dispatchSelect.setDefaultUsers(session.dispatch.map((agent) => agent.userId));

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId(`atm:status:${id}`)
    .setPlaceholder('Statut de la session')
    .addOptions(
      STATUSES.map((status) => ({
        label: status.label,
        value: status.value,
        emoji: status.emoji,
        default: status.value === session.status,
      })),
    );

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`atm:roles:${id}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏷️')
      .setLabel('Rôles des agents')
      .setDisabled(!session.dispatch.length),
    new ButtonBuilder()
      .setCustomId(`atm:edit:${id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️')
      .setLabel('Modifier les infos'),
  ];

  if (isCloudinaryEnabled()) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`atm:photo:${id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📸')
        .setLabel('Ajouter des photos')
        .setDisabled(session.photos.length >= MAX_PHOTOS),
    );
    if (session.photos.length) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`atm:photoclear:${id}`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🧹')
          .setLabel('Retirer les photos'),
      );
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(summary.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(dispatchSelect),
      new ActionRowBuilder().addComponents(statusSelect),
      new ActionRowBuilder().addComponents(buttons),
    );

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

module.exports = { renderPanel };
