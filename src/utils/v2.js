const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');

/** Séparateur (ligne + petit espacement), comme dans le modèle de message. */
const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

/**
 * Message texte au format Components V2 : séparateur, container avec le texte, séparateur.
 * @param {string} content
 */
function textMessage(content) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      separator(),
      new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
      separator(),
    ],
    allowedMentions: { parse: [] },
  };
}

/** Même chose, en message éphémère (visible uniquement par l'utilisateur). */
function ephemeralText(content) {
  const message = textMessage(content);
  return { ...message, flags: message.flags | MessageFlags.Ephemeral };
}

module.exports = { separator, textMessage, ephemeralText };
