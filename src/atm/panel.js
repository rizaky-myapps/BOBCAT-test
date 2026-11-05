const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const { STATUSES, findLabel } = require('./constants');
const { sessionUrl } = require('./service');
const { toUnix } = require('../utils/date');
const { separator } = require('../utils/v2');

const button = (customId, style, emoji, label) =>
  new ButtonBuilder().setCustomId(customId).setStyle(style).setEmoji(emoji).setLabel(label);

/**
 * Panneau de gestion (éphémère) ouvert par le bouton ⚙️ d'une session postée.
 * - En attente : Annuler, Dispatching, Informations, Commencer
 * - En cours : Nouvelle PDS, Finir la session
 * @param {import('../models/AtmSession')} session
 * @param {string} [notice] Message affiché sous le résumé.
 */
function renderSessionPanel(session, notice) {
  const id = session._id.toString();
  const ts = toUnix(session.scheduledAt);

  const text = [
    '## ⚙️ Gestion de la session ATM',
    `> **Date :** <t:${ts}:d> à <t:${ts}:t> (<t:${ts}:R>)`,
    `> **Statut :** \`${findLabel(STATUSES, session.status)}\``,
    `> [Voir la session](${sessionUrl(session)})`,
  ];
  if (notice) text.push('', notice);

  const buttons =
    session.status === 'in_progress'
      ? [
          button(`atm:ppds:${id}`, ButtonStyle.Primary, '📦', 'Nouvelle PDS'),
          button(`atm:pfinish:${id}`, ButtonStyle.Danger, '🏁', 'Finir la session'),
        ]
      : [
          button(`atm:pcancel:${id}:panel`, ButtonStyle.Danger, '🛑', 'Annuler'),
          button(`atm:pdispatch:${id}`, ButtonStyle.Primary, '👥', 'Dispatching'),
          button(`atm:pinfo:${id}`, ButtonStyle.Secondary, '📝', 'Informations'),
          button(`atm:pstart:${id}`, ButtonStyle.Success, '▶️', 'Commencer'),
        ];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

  // Dispatching en deux étapes : Discord ne permet pas d'ouvrir le 2e modal directement après le 1er.
  if (session.status === 'pending' && session.pendingDispatch?.length) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`atm:pdriver:${id}`, ButtonStyle.Primary, '🚙', 'Choisir le conducteur'),
      ),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { renderSessionPanel };
