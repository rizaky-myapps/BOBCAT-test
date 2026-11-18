const {
  ActionRowBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
} = require('discord.js');
const SeparatorChannel = require('../models/SeparatorChannel');
const { separator } = require('../utils/v2');
const { MAX_OPTIONS, button, buildDeleteModal, collator, panelMessage, section, text } = require('./ui');

const CHANNELS_FIELD = 'salons';

/** Salons enregistrés, triés par nom (un salon supprimé de Discord est affiché par son identifiant). */
async function getSeparatorChannels(guild) {
  const entries = await SeparatorChannel.find({ guildId: guild.id });
  return entries
    .map((entry) => ({ id: entry.channelId, name: guild.channels?.cache.get(entry.channelId)?.name ?? entry.channelId }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** Panneau « Séparateurs » : salons où le bot doit envoyer un message tous les dimanches à 23:59:59. */
async function renderSeparatorPanel(guild) {
  const channels = await getSeparatorChannels(guild);
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
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button('sep:del', 'Retirer un salon', ButtonStyle.Danger).setDisabled(!channels.length)),
    );
  return panelMessage(container);
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
  buildAddSeparatorModal,
  buildDeleteSeparatorModal,
  getSeparatorChannels,
  renderSeparatorPanel,
};
