const { ActionRowBuilder, ButtonStyle, ContainerBuilder, LabelBuilder, ModalBuilder, StringSelectMenuBuilder } = require('discord.js');
const PatrolPlace = require('../models/PatrolPlace');
const { separator } = require('../utils/v2');
const EMOJI = require('../emoji');
const { button, buildDeleteModal, collator, panelMessage, section, text, textField } = require('./ui');

const MAX_NAME_LENGTH = 100;
const MAX_EMOJI_LENGTH = 64;
const LIST_CHARS = 3500;
/** Une semaine : du lundi 00:00 au dimanche 23:59:59. */
const WEEK_MINUTES = 7 * 24 * 60;

const FIELDS = { name: 'nom', emoji: 'emoji', weekly: 'temps_semaine', when: 'quand', visit: 'temps_passage' };

/** « Quand s'y rendre ? » */
const WHEN_CHOICES = [
  { value: 'toujours', label: 'Disponible tout le temps', emoji: EMOJI.LIEU_DISPONIBLE },
  { value: 'ouvert', label: "Uniquement si l'entreprise est ouverte", emoji: EMOJI.LIEU_ENTREPRISE_OUVERTE },
  { value: 'centrale', label: 'Uniquement sur appel centrale', emoji: EMOJI.LIEU_APPEL_CENTRALE },
];

/** « Temps max par passage ? » (minutes) */
const VISIT_CHOICES = [
  { value: '15', label: '15min max' },
  { value: '30', label: '30min max' },
];

/* ------------------------------------------------------------------ */
/* Saisies                                                             */
/* ------------------------------------------------------------------ */

/** Émoji Unicode (🏦, 🇫🇷, 1️⃣…) ou émoji du serveur (<:nom:id>). */
const isEmoji = (value) =>
  /^(?:<a?:\w{2,32}:\d{17,20}>|(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)(?:[️‍\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}])*)$/u.test(
    value,
  );

/** "2h", "1h30", "1 h 30 min", "45min" → minutes ; null si la durée n'est pas valide (max : une semaine). */
function parseDuration(raw) {
  const value = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  const match = /^(?:(\d{1,3})h(?:(\d{1,2})(?:min|mn|m)?)?|(\d{1,5})(?:min|mn|m))$/.exec(value);
  if (!match) return null;
  if (match[2] !== undefined && Number(match[2]) >= 60) return null;
  const minutes = match[3] !== undefined ? Number(match[3]) : Number(match[1]) * 60 + Number(match[2] ?? 0);
  return minutes > 0 && minutes <= WEEK_MINUTES ? minutes : null;
}

/** 90 → "1 h 30", 120 → "2 h", 45 → "45 min". */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

/* ------------------------------------------------------------------ */
/* Panneau                                                             */
/* ------------------------------------------------------------------ */

const sortPlaces = (places) => [...places].sort((a, b) => collator.compare(a.name, b.name));

/** Lieu dans la liste : émoji et nom, puis quand s'y rendre et les temps maximum. */
function placeText(place) {
  const when = WHEN_CHOICES.find((choice) => choice.value === place.when);
  const details = [
    place.weeklyMaxMinutes ? `${formatDuration(place.weeklyMaxMinutes)} max / semaine` : null,
    place.visitMaxMinutes ? `${place.visitMaxMinutes} min max / passage` : null,
  ].filter(Boolean);
  return [
    `${place.emoji ? `${place.emoji} ` : ''}**${place.name}**`,
    when ? `> ${when.emoji} ${when.label}` : null,
    details.length ? `> ${details.join(' • ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Panneau « Lieux de patrouille » : liste triée par nom, « Ajouter un lieu » en haut à droite, « Supprimer » en bas. */
async function renderPlacePanel(guildId) {
  const places = sortPlaces(await PatrolPlace.find({ guildId }));

  const blocks = [];
  let chars = 0;
  for (const place of places) {
    const block = placeText(place);
    if (chars + block.length > LIST_CHARS) {
      blocks.push(`… et ${places.length - blocks.length} autre(s) lieu(x)`);
      break;
    }
    blocks.push(block);
    chars += block.length + 2;
  }

  const container = new ContainerBuilder()
    .addSectionComponents(section('## Lieux de patrouille', button('lieu:add', 'Ajouter un lieu', ButtonStyle.Success)))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(blocks.length ? blocks.join('\n\n') : 'Aucun lieu enregistré.'))
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button('lieu:del', 'Supprimer', ButtonStyle.Danger).setDisabled(!places.length)),
    );
  return panelMessage(container);
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

const selectField = (label, customId, placeholder, options) =>
  new LabelBuilder()
    .setLabel(label)
    .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options));

/** « Ajouter un lieu » : nom, émoji, temps max par semaine, quand s'y rendre, temps max par passage. */
const buildAddPlaceModal = () =>
  new ModalBuilder()
    .setCustomId('lieu:addsub')
    .setTitle('Ajouter un lieu')
    .addLabelComponents(
      textField("Nom de l'entreprise / Lieu", FIELDS.name, { maxLength: MAX_NAME_LENGTH }),
      textField('Emoji du lieu', FIELDS.emoji, { placeholder: 'Ex : 🏦', maxLength: MAX_EMOJI_LENGTH }),
      textField('Temps max / semaine', FIELDS.weekly, {
        description: 'Du lundi 00:00 au dimanche 23:59:59 (ex : 2h, 1h30, 45min).',
        placeholder: 'Ex : 2h',
        maxLength: 20,
      }),
      selectField("Quand s'y rendre ?", FIELDS.when, 'Sélectionne quand s’y rendre', WHEN_CHOICES),
      selectField('Temps max par passage ?', FIELDS.visit, 'Sélectionne le temps max', VISIT_CHOICES),
    );

const buildDeletePlaceModal = (places) =>
  buildDeleteModal({
    customId: 'lieu:delsub',
    title: 'Supprimer des lieux',
    label: 'Lieux',
    options: sortPlaces(places).map((place) => ({ label: place.name, value: String(place._id) })),
  });

module.exports = {
  FIELDS,
  MAX_EMOJI_LENGTH,
  VISIT_CHOICES,
  WHEN_CHOICES,
  buildAddPlaceModal,
  buildDeletePlaceModal,
  formatDuration,
  isEmoji,
  parseDuration,
  renderPlacePanel,
};
