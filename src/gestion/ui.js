const {
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { separator } = require('../utils/v2');

/** Un menu Discord est limité à 25 choix, un modal à 5 composants. */
const MAX_OPTIONS = 25;
const MAX_SELECTS = 5;

const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const text = (content) => new TextDisplayBuilder().setContent(content);
const button = (customId, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(customId).setStyle(style).setLabel(label);

/** Tri alphabétique français (sans tenir compte des majuscules ni des accents, nombres dans l'ordre). */
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Espaces multiples remplacés par un seul, sans espace au début ni à la fin. */
const normalizeSpaces = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Texte avec un bouton à droite (ex : titre du panneau + « Ajouter »). */
const section = (content, accessory) =>
  new SectionBuilder().addTextDisplayComponents(text(content)).setButtonAccessory(accessory);

/** Panneau (Components V2) : séparateur, container, séparateur. */
const panelMessage = (container) => ({
  flags: MessageFlags.IsComponentsV2,
  components: [separator(), container, separator()],
  allowedMentions: { parse: [] },
});

/** Même chose, en réponse éphémère. */
const ephemeralPanel = (message) => ({ ...message, flags: message.flags | MessageFlags.Ephemeral });

/** Champ texte d'un modal. */
function textField(label, customId, { description, placeholder, maxLength, value, required = true } = {}) {
  const input = new TextInputBuilder().setCustomId(customId).setStyle(TextInputStyle.Short).setRequired(required);
  if (maxLength) input.setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(value);
  const labelBuilder = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (description) labelBuilder.setDescription(description);
  return labelBuilder;
}

/** Identifiants des listes d'un modal de suppression. */
const DELETE_FIELDS = Array.from({ length: MAX_SELECTS }, (_, i) => `liste_${i + 1}`);

/**
 * Modal de suppression : les éléments sont répartis dans une ou plusieurs listes de 25 (5 listes au maximum).
 * @param {{ customId: string, title: string, label: string, options: { label: string, value: string, description?: string }[] }} params
 */
function buildDeleteModal({ customId, title, label, options }) {
  const chunks = [];
  for (let i = 0; i < Math.min(options.length, MAX_OPTIONS * MAX_SELECTS); i += MAX_OPTIONS) {
    chunks.push(options.slice(i, i + MAX_OPTIONS));
  }
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  chunks.forEach((chunk, i) => {
    const labelBuilder = new LabelBuilder()
      .setLabel(chunks.length > 1 ? `${label} (${i + 1}/${chunks.length})` : label)
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId(DELETE_FIELDS[i])
          .setPlaceholder('Sélectionne les éléments à supprimer')
          .setRequired(false)
          .setMinValues(0)
          .setMaxValues(chunk.length)
          .addOptions(chunk.map((option) => ({ ...option, label: truncate(option.label, 100) }))),
      );
    if (options.length > MAX_OPTIONS * MAX_SELECTS && i === 0) {
      labelBuilder.setDescription(`Seuls les ${MAX_OPTIONS * MAX_SELECTS} premiers sont affichés.`);
    }
    modal.addLabelComponents(labelBuilder);
  });
  return modal;
}

/** Valeurs choisies dans les listes d'un modal de suppression. */
const getDeleteSelection = (interaction) =>
  DELETE_FIELDS.flatMap((id) => interaction.fields.fields.get(id)?.values ?? []);

module.exports = {
  MAX_OPTIONS,
  button,
  buildDeleteModal,
  collator,
  ephemeralPanel,
  getDeleteSelection,
  normalizeSpaces,
  panelMessage,
  section,
  text,
  textField,
  truncate,
};
