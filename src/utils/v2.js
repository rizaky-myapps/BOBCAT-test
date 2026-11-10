const {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');

/** Séparateur (ligne + petit espacement), comme dans le modèle de message. */
const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

/**
 * Message texte au format Components V2 : séparateur, container avec le texte (et des boutons), séparateur.
 * @param {string} content
 * @param {{ buttons?: import('discord.js').ButtonBuilder[] }} [options] Boutons affichés sous le texte.
 */
function textMessage(content, { buttons = [] } = {}) {
  const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  if (buttons.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { parse: [] },
  };
}

/** Même chose, en message éphémère (visible uniquement par l'utilisateur). */
function ephemeralText(content) {
  const message = textMessage(content);
  return { ...message, flags: message.flags | MessageFlags.Ephemeral };
}

module.exports = { separator, textMessage, ephemeralText };
