const { randomBytes } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
} = require('discord.js');
const PatrolPlace = require('../models/PatrolPlace');
const EMOJI = require('../emoji');
const { MAX_OPTIONS, button, buildDeleteModal, collator, panelMessage, section, text, textField, truncate } = require('./ui');

const MAX_NAME_LENGTH = 100;
const MAX_EMOJI_LENGTH = 64;
/** Caractères de la liste (un message Discord est limité à 4000). */
const LIST_CHARS = 3600;
/** Une semaine : du lundi 00:00 au dimanche 23:59:59. */
const WEEK_MINUTES = 7 * 24 * 60;
/** Message du ✏️ : jusqu'à 4 listes de 25 lieux. */
const MAX_PICK_SELECTS = 4;

const FIELDS = { name: 'nom', emoji: 'emoji', weekly: 'temps_semaine', when: 'quand', visit: 'temps_passage' };

/** « Quand s'y rendre ? » : les lieux sont regroupés par catégorie. */
const WHEN_CHOICES = [
  { value: 'toujours', label: 'Disponible tout le temps', emoji: EMOJI.LIEU_DISPONIBLE },
  { value: 'ouvert', label: "Uniquement si l'entreprise est ouverte", emoji: EMOJI.LIEU_ENTREPRISE_OUVERTE },
  { value: 'centrale', label: 'Uniquement sur appel centrale', emoji: EMOJI.LIEU_APPEL_CENTRALE },
];
/** Lieux enregistrés avant « Quand s'y rendre ? » : à modifier pour leur donner une catégorie. */
const NO_CATEGORY = { value: 'aucune', label: 'Sans catégorie', emoji: null };
const CATEGORIES = [...WHEN_CHOICES, NO_CATEGORY];

/** « Temps max par passage ? » (minutes, facultatif) */
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

/** "5h", "1h30", "1 h 30 min", "45min", "0" (infini) → minutes ; null si la durée n'est pas valide (max : une semaine). */
function parseDuration(raw) {
  const value = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  if (value === '0') return 0;
  const match = /^(?:(\d{1,3})h(?:(\d{1,2})(?:min|mn|m)?)?|(\d{1,5})(?:min|mn|m))$/.exec(value);
  if (!match) return null;
  if (match[2] !== undefined && Number(match[2]) >= 60) return null;
  const minutes = match[3] !== undefined ? Number(match[3]) : Number(match[1]) * 60 + Number(match[2] ?? 0);
  return minutes <= WEEK_MINUTES ? minutes : null;
}

/** 0 → "0h", 45 → "0h45", 90 → "1h30", 300 → "5h". */
function formatHours(minutes) {
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest ? String(rest).padStart(2, '0') : ''}`;
}

/**
 * Temps passé dans le lieu cette semaine (du lundi 00:00 au dimanche 23:59:59), en minutes.
 * Les patrouilles n'enregistrent pas encore de temps (la suite de /patrouille est en développement) : 0.
 */
const getWeeklyTimeSpent = () => 0;

/* ------------------------------------------------------------------ */
/* Panneau                                                             */
/* ------------------------------------------------------------------ */

const sortPlaces = (places) => [...places].sort((a, b) => collator.compare(a.name, b.name));
const categoryOf = (place) => WHEN_CHOICES.find((choice) => choice.value === place.when) ?? NO_CATEGORY;
const categoryTitle = (category) => `${category.emoji ? `${category.emoji} ` : ''}${category.label}`;

/** Lieu dans la liste : émoji et nom, temps effectué cette semaine, temps max par passage. */
function placeText(place) {
  const done = getWeeklyTimeSpent(place);
  const max = place.weeklyMaxMinutes;
  let time;
  if (max === null || max === undefined) time = `Temps effectué : ${formatHours(done)}`;
  else if (max === 0) time = `Temps effectué : ${formatHours(done)} (Le temps est réglé sur 0 soit infini)`;
  else time = `Temps effectué : ${formatHours(done)}/${formatHours(max)} (${Math.round((done / max) * 100)}% reste ${formatHours(Math.max(0, max - done))})`;
  return [
    `> - ${place.emoji ? `${place.emoji} ` : ''}**${place.name}**`,
    `>   - ${time}`,
    `>   - ${place.visitMaxMinutes ? `${place.visitMaxMinutes}min max par passage` : '*Pas de temps limite*'}`,
  ].join('\n');
}

/** Espace entre les catégories. */
const spacer = () => new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large);

/** Bouton ✏️ d'une catégorie. */
const penButton = (category) =>
  new ButtonBuilder().setCustomId(`lieu:pen:${category.value}`).setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.BOUTON_MODIFIER_LIEU);

/** Lieux regroupés par catégorie (« Quand s'y rendre ? »), triés par nom. */
function groupPlaces(places) {
  return CATEGORIES.map((category) => ({
    category,
    places: sortPlaces(places.filter((place) => categoryOf(place) === category)),
  })).filter((group) => group.places.length);
}

/**
 * Panneau « Lieux de patrouille » : « Ajouter un lieu » en haut à droite, puis une partie par
 * « Quand s'y rendre ? » avec un bouton ✏️ (modifier un lieu de cette partie).
 */
async function renderPlacePanel(guildId) {
  const groups = groupPlaces(await PatrolPlace.find({ guildId }));
  const container = new ContainerBuilder().addSectionComponents(
    section('# Lieux de patrouille', button('lieu:add', 'Ajouter un lieu', ButtonStyle.Success)),
  );
  if (!groups.length) container.addSeparatorComponents(spacer()).addTextDisplayComponents(text('Aucun lieu enregistré.'));

  let chars = 0;
  for (const { category, places } of groups) {
    const blocks = [];
    for (const [index, place] of places.entries()) {
      const block = placeText(place);
      if (chars + block.length > LIST_CHARS) {
        blocks.push(`> … et ${places.length - index} autre(s) lieu(x)`);
        break;
      }
      blocks.push(block);
      chars += block.length + 3;
    }
    container
      .addSeparatorComponents(spacer())
      .addSectionComponents(section(`### ${categoryTitle(category)} :\n${blocks.join('\n> \n')}`, penButton(category)));
  }
  return panelMessage(container);
}

/* ------------------------------------------------------------------ */
/* Message du ✏️ : liste des entreprises de la catégorie               */
/* ------------------------------------------------------------------ */

/** Option d'un menu : nom de l'entreprise avec son émoji. */
function placeOption(place) {
  const option = { label: truncate(place.name, 100), value: String(place._id) };
  if (place.emoji && isEmoji(place.emoji)) option.emoji = place.emoji;
  return option;
}

/**
 * Message affiché par le ✏️ d'une catégorie : la liste des entreprises (en choisir une ouvre le modal de
 * modification) et « Supprimer ». `key` : référence du panneau à mettre à jour après une modification.
 */
async function renderPenMessage(guildId, categoryValue, key, notice) {
  const category = CATEGORIES.find((item) => item.value === categoryValue) ?? NO_CATEGORY;
  const places = sortPlaces((await PatrolPlace.find({ guildId })).filter((place) => categoryOf(place) === category));

  const lines = [notice, `### ${categoryTitle(category)}`, places.length ? "Sélectionne l'entreprise à modifier." : 'Aucun lieu dans cette catégorie.'];
  const container = new ContainerBuilder().addTextDisplayComponents(text(lines.filter(Boolean).join('\n')));

  const chunks = [];
  for (let i = 0; i < Math.min(places.length, MAX_OPTIONS * MAX_PICK_SELECTS); i += MAX_OPTIONS) chunks.push(places.slice(i, i + MAX_OPTIONS));
  chunks.forEach((chunk, i) => {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`lieu:pick:${category.value}:${key}:${i}`)
          .setPlaceholder(chunks.length > 1 ? `Sélectionne l'entreprise (${i + 1}/${chunks.length})` : "Sélectionne l'entreprise")
          .addOptions(chunk.map(placeOption)),
      ),
    );
  });
  if (places.length) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(button(`lieu:pdel:${category.value}:${key}`, 'Supprimer', ButtonStyle.Danger)),
    );
  }
  return panelMessage(container);
}

/** Panneaux à mettre à jour après une modification faite depuis un message ✏️ (jeton valable 15 min). */
const panels = new Map();
const PANEL_LIFETIME = 14 * 60 * 1000;

/** Retient le panneau dont le ✏️ a été cliqué (interaction différée sur ce panneau). */
function rememberPanel(interaction) {
  for (const [key, ref] of panels) if (ref.expiresAt < Date.now()) panels.delete(key);
  const key = randomBytes(4).toString('hex');
  panels.set(key, { webhook: interaction.webhook, expiresAt: Date.now() + PANEL_LIFETIME });
  return key;
}

/** Met à jour le panneau « Lieux de patrouille » retenu (s'il est encore joignable). */
async function refreshPanel(key, guildId) {
  const ref = panels.get(key);
  if (!ref || ref.expiresAt < Date.now()) return;
  try {
    await ref.webhook.editMessage('@original', await renderPlacePanel(guildId));
  } catch (error) {
    console.error('[Lieux] Mise à jour du panneau impossible :', error);
  }
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

const selectField = (label, customId, placeholder, options, { selected, required = true } = {}) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options.map((option) => ({ ...option, default: option.value === selected })));
  if (!required) select.setRequired(false).setMinValues(0).setMaxValues(1);
  return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(select);
};

/**
 * Modal d'un lieu : nom, émoji, temps max par semaine, quand s'y rendre, temps max par passage (facultatif).
 * @param {string} customId
 * @param {string} title
 * @param {object} [place] Lieu modifié (champs pré-remplis).
 */
function buildPlaceModal(customId, title, place) {
  const weekly = place?.weeklyMaxMinutes;
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(truncate(title, 45))
    .addLabelComponents(
      textField("Nom de l'entreprise / Lieu", FIELDS.name, { maxLength: MAX_NAME_LENGTH, value: place?.name }),
      textField('Emoji du lieu', FIELDS.emoji, { placeholder: 'Ex : 🏦', maxLength: MAX_EMOJI_LENGTH, value: place?.emoji ?? undefined }),
      textField('Temps max / semaine', FIELDS.weekly, {
        description: 'Du lundi 00:00 au dimanche 23:59:59. 0 = infini (ex : 5h, 1h30, 45min).',
        placeholder: 'Ex : 5h',
        maxLength: 20,
        value: weekly === null || weekly === undefined ? undefined : formatHours(weekly),
      }),
      selectField("Quand s'y rendre ?", FIELDS.when, 'Sélectionne quand s’y rendre', WHEN_CHOICES, { selected: place?.when }),
      selectField('Temps max par passage ?', FIELDS.visit, 'Pas de temps limite', VISIT_CHOICES, {
        selected: place?.visitMaxMinutes ? String(place.visitMaxMinutes) : undefined,
        required: false,
      }),
    );
}

const buildAddPlaceModal = () => buildPlaceModal('lieu:addsub', 'Ajouter un lieu');
const buildEditPlaceModal = (place, categoryValue, key) =>
  buildPlaceModal(`lieu:editsub:${place._id}:${categoryValue}:${key}`, `Modifier : ${place.name}`, place);

/** Valeurs saisies dans le modal d'un lieu, ou le message d'erreur. */
function readPlaceFields(fields) {
  const name = fields.getTextInputValue(FIELDS.name).replace(/\s+/g, ' ').trim();
  const emoji = fields.getTextInputValue(FIELDS.emoji).replace(/\s+/g, '');
  const weeklyMaxMinutes = parseDuration(fields.getTextInputValue(FIELDS.weekly));
  const [when] = fields.getStringSelectValues(FIELDS.when);
  const [visit = null] = fields.fields.get(FIELDS.visit)?.values ?? [];

  if (!name) return { error: `${EMOJI.ERREUR} Renseigne le nom de l'entreprise / du lieu.` };
  if (!isEmoji(emoji)) {
    return { error: `${EMOJI.ERREUR} « Emoji du lieu » : indique un seul émoji (ex : 🏦) ou un émoji du serveur au format \`<:nom:id>\`.` };
  }
  if (weeklyMaxMinutes === null) {
    return { error: `${EMOJI.ERREUR} « Temps max / semaine » : indique une durée, ex : 5h, 1h30 ou 45min (0 = infini, une semaine maximum).` };
  }
  if (!WHEN_CHOICES.some((choice) => choice.value === when) || (visit && !VISIT_CHOICES.some((choice) => choice.value === visit))) {
    return { error: `${EMOJI.ERREUR} Réponses invalides, réessaie.` };
  }
  return {
    values: { name, nameKey: name.toLocaleLowerCase('fr'), emoji, weeklyMaxMinutes, when, visitMaxMinutes: visit ? Number(visit) : null },
  };
}

/** « Supprimer » du message ✏️ : lieux de la catégorie. */
const buildDeletePlaceModal = (places, categoryValue, key) =>
  buildDeleteModal({
    customId: `lieu:pdelsub:${categoryValue}:${key}`,
    title: 'Supprimer des lieux',
    label: 'Lieux',
    options: sortPlaces(places).map(placeOption),
  });

module.exports = {
  CATEGORIES,
  FIELDS,
  NO_CATEGORY,
  VISIT_CHOICES,
  WHEN_CHOICES,
  buildAddPlaceModal,
  buildDeletePlaceModal,
  buildEditPlaceModal,
  categoryOf,
  formatHours,
  isEmoji,
  parseDuration,
  readPlaceFields,
  refreshPanel,
  rememberPanel,
  renderPenMessage,
  renderPlacePanel,
};
