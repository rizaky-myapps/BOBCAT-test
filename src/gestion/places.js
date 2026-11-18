const { ActionRowBuilder, ButtonStyle, ContainerBuilder, ModalBuilder } = require('discord.js');
const PatrolPlace = require('../models/PatrolPlace');
const { separator } = require('../utils/v2');
const { button, buildDeleteModal, collator, panelMessage, section, text, textField } = require('./ui');

const MAX_NAME_LENGTH = 100;
const LIST_CHARS = 3500;
const NAME_FIELD = 'nom';

const sortPlaces = (places) => [...places].sort((a, b) => collator.compare(a.name, b.name));

/** Panneau « Lieux de patrouille » : liste triée par nom, « Ajouter un lieu » en haut à droite, « Supprimer » en bas. */
async function renderPlacePanel(guildId) {
  const places = sortPlaces(await PatrolPlace.find({ guildId }));

  const lines = [];
  let chars = 0;
  for (const place of places) {
    const line = `> - ${place.name}`;
    if (chars + line.length > LIST_CHARS) {
      lines.push(`> … et ${places.length - lines.length} autre(s) lieu(x)`);
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }

  const container = new ContainerBuilder()
    .addSectionComponents(section('## Lieux de patrouille', button('lieu:add', 'Ajouter un lieu', ButtonStyle.Success)))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(lines.length ? lines.join('\n') : 'Aucun lieu enregistré.'))
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button('lieu:del', 'Supprimer', ButtonStyle.Danger).setDisabled(!places.length)),
    );
  return panelMessage(container);
}

const buildAddPlaceModal = () =>
  new ModalBuilder()
    .setCustomId('lieu:addsub')
    .setTitle('Ajouter un lieu')
    .addLabelComponents(textField('Nom du lieu', NAME_FIELD, { maxLength: MAX_NAME_LENGTH }));

const buildDeletePlaceModal = (places) =>
  buildDeleteModal({
    customId: 'lieu:delsub',
    title: 'Supprimer des lieux',
    label: 'Lieux',
    options: sortPlaces(places).map((place) => ({ label: place.name, value: String(place._id) })),
  });

module.exports = { NAME_FIELD, buildAddPlaceModal, buildDeletePlaceModal, renderPlacePanel };
