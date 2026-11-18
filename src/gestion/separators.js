const {
  ActionRowBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const SeparatorChannel = require('../models/SeparatorChannel');
const SeparatorText = require('../models/SeparatorText');
const { separator } = require('../utils/v2');
const { MAX_OPTIONS, button, buildDeleteModal, collator, panelMessage, section, text, truncate } = require('./ui');

const CHANNELS_FIELD = 'salons';
const TEXT_FIELD = 'texte';
const MAX_TEXT_LENGTH = 2000;
/** Longueur du texte affiché dans le panneau (le texte complet est dans le modal « Choisir le texte »). */
const PREVIEW_LENGTH = 1500;

/** Texte envoyé chaque dimanche ('' s'il n'est pas encore choisi). */
const getSeparatorText = async (guildId) => (await SeparatorText.findOne({ guildId }))?.text ?? '';

/** Salons enregistrés, triés par nom (un salon supprimé de Discord est affiché par son identifiant). */
async function getSeparatorChannels(guild) {
  const entries = await SeparatorChannel.find({ guildId: guild.id });
  return entries
    .map((entry) => ({ id: entry.channelId, name: guild.channels?.cache.get(entry.channelId)?.name ?? entry.channelId }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Panneau « Séparateurs » : salons où le bot doit envoyer un message tous les dimanches à 23:59:59
 * et texte de ce message (« Choisir le texte »).
 */
async function renderSeparatorPanel(guild) {
  const channels = await getSeparatorChannels(guild);
  const message = await getSeparatorText(guild.id);
  const container = new ContainerBuilder()
    .addSectionComponents(
      section(
        '## Séparateurs\nSalons dans lesquels le bot doit envoyer un message tous les dimanches à 23:59:59.',
        button('sep:add', 'Ajouter un salon', ButtonStyle.Success),
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          channels.length ? channels.map((channel) => `> - <#${channel.id}>`).join('\n') : 'Aucun salon enregistré.',
          "-# L'envoi automatique sera défini plus tard.",
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      section(
        `### Texte envoyé\n${message ? truncate(message, PREVIEW_LENGTH) : 'Aucun texte choisi.'}`,
        button('sep:text', 'Choisir le texte'),
      ),
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button('sep:del', 'Retirer un salon', ButtonStyle.Danger).setDisabled(!channels.length)),
    );
  return panelMessage(container);
}

/** « Choisir le texte » : texte envoyé chaque dimanche (pré-rempli avec le texte actuel). */
function buildSeparatorTextModal(current) {
  const input = new TextInputBuilder()
    .setCustomId(TEXT_FIELD)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(MAX_TEXT_LENGTH)
    .setRequired(true);
  if (current) input.setValue(current);
  return new ModalBuilder()
    .setCustomId('sep:textsub')
    .setTitle('Texte des séparateurs')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Texte')
        .setDescription('Envoyé tous les dimanches à 23:59:59 dans les salons de la liste.')
        .setTextInputComponent(input),
    );
}

/** « Ajouter un salon » : sélection d'un ou plusieurs salons textuels. */
const buildAddSeparatorModal = () =>
  new ModalBuilder()
    .setCustomId('sep:addsub')
    .setTitle('Ajouter un salon')
    .addLabelComponents(
      new LabelBuilder().setLabel('Salons').setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId(CHANNELS_FIELD)
          .setPlaceholder('Sélectionne les salons')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(MAX_OPTIONS),
      ),
    );

const buildDeleteSeparatorModal = (channels) =>
  buildDeleteModal({
    customId: 'sep:delsub',
    title: 'Retirer des salons',
    label: 'Salons',
    options: channels.map((channel) => ({ label: `#${channel.name}`, value: channel.id })),
  });

module.exports = {
  CHANNELS_FIELD,
  TEXT_FIELD,
  buildAddSeparatorModal,
  buildDeleteSeparatorModal,
  buildSeparatorTextModal,
  getSeparatorChannels,
  getSeparatorText,
  renderSeparatorPanel,
};
