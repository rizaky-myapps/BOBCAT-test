const {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const Vehicle = require('../models/Vehicle');
const { separator } = require('../utils/v2');
const EMOJI = require('../emoji');
const {
  MAX_OPTIONS,
  button,
  buildDeleteModal,
  collator,
  normalizeSpaces,
  panelMessage,
  section,
  text,
  textField,
  truncate,
} = require('./ui');

const MAX_NAME_LENGTH = 40;
const MAX_PLATE_LENGTH = 8;
const MAX_KM = 9_999_999;
/** Limites d'un message Discord (40 composants, 4000 caractères) : la liste est découpée en pages. */
const GROUPS_PER_PAGE = 9;
const PAGE_CHARS = 3500;
const GROUP_CHARS = 3300;
/** « Modifier : <nom> » : jusqu'à 4 listes de 25 plaques (+ le kilométrage : 5 composants par modal). */
const MAX_EDIT_SELECTS = 4;

const FIELDS = { name: 'nom', plate: 'plaque', km: 'kilometrage' };
const PLATE_FIELDS = Array.from({ length: MAX_EDIT_SELECTS }, (_, i) => `${FIELDS.plate}_${i + 1}`);

/* ------------------------------------------------------------------ */
/* Saisies                                                             */
/* ------------------------------------------------------------------ */

/** Plaque en majuscules, espaces simples. */
const normalizePlate = (raw) => normalizeSpaces(raw).toUpperCase();

function getPlateError(plate) {
  if (!plate) return `${EMOJI.ERREUR} Renseigne la plaque d'immatriculation.`;
  if (plate.length > MAX_PLATE_LENGTH || !/^[A-Z0-9 ]+$/.test(plate)) {
    return `${EMOJI.ERREUR} La plaque doit faire ${MAX_PLATE_LENGTH} caractères maximum : lettres, chiffres et espaces uniquement.`;
  }
  return null;
}

/** "12 500", "12.500" ou "12500 km" → 12500 ; null si ce n'est pas un nombre entier. */
function parseKm(raw) {
  const digits = String(raw ?? '').trim().replace(/\s*km$/i, '').replace(/[\s.,  ]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const km = Number(digits);
  return km <= MAX_KM ? km : null;
}

const KM_ERROR = `${EMOJI.ERREUR} Le kilométrage doit être un nombre entier (ex : 12500).`;

const formatKm = (km) => `${new Intl.NumberFormat('fr-FR').format(km)} km`;

/* ------------------------------------------------------------------ */
/* Panneau                                                             */
/* ------------------------------------------------------------------ */

const sameName = (a, b) => collator.compare(a, b) === 0;

/** Véhicules regroupés par nom (triés par nom, puis par plaque). */
function groupVehicles(vehicles) {
  const sorted = [...vehicles].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.plate, b.plate));
  const groups = [];
  for (const vehicle of sorted) {
    const group = groups.find((item) => sameName(item.name, vehicle.name));
    if (group) group.vehicles.push(vehicle);
    else groups.push({ name: vehicle.name, vehicles: [vehicle] });
  }
  return groups;
}

function groupText(group) {
  const lines = [`### ${group.name}`];
  let chars = lines[0].length;
  for (const [index, vehicle] of group.vehicles.entries()) {
    const line = `> \`${vehicle.plate}\` • Prochain entretien : **${formatKm(vehicle.nextServiceKm)}**`;
    // Limite de caractères d'un message Discord (seulement si un type compte des dizaines de véhicules).
    if (chars + line.length > GROUP_CHARS) {
      lines.push(`> … et ${group.vehicles.length - index} autre(s)`);
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }
  return lines.join('\n');
}

/** Découpe les groupes en pages (nombre de composants et de caractères limités par Discord). */
function paginate(groups) {
  const pages = [[]];
  let chars = 0;
  for (const group of groups) {
    const length = groupText(group).length;
    const page = pages[pages.length - 1];
    if (page.length && (page.length >= GROUPS_PER_PAGE || chars + length > PAGE_CHARS)) {
      pages.push([group]);
      chars = length;
    } else {
      page.push(group);
      chars += length;
    }
  }
  return pages;
}

/**
 * Panneau « Véhicules » : liste triée par nom, kilométrage du prochain entretien de chaque véhicule,
 * « Ajouter un véhicule » en haut à droite, « Modifier : <nom> » devant chaque type, « Supprimer » en bas.
 * @param {string} guildId
 * @param {{ page?: number, focus?: string }} [options] focus : nom du véhicule dont la page est affichée.
 */
async function renderVehiclePanel(guildId, { page = 0, focus } = {}) {
  const vehicles = await Vehicle.find({ guildId });
  const pages = paginate(groupVehicles(vehicles));
  if (focus) {
    const index = pages.findIndex((groups) => groups.some((group) => sameName(group.name, focus)));
    if (index >= 0) page = index;
  }
  page = Math.min(Math.max(0, Number(page) || 0), pages.length - 1);

  const title = ["## Véhicules de l'entreprise", pages.length > 1 ? `-# Page ${page + 1}/${pages.length}` : null];
  const container = new ContainerBuilder()
    .addSectionComponents(section(title.filter(Boolean).join('\n'), button(`veh:add:${page}`, 'Ajouter un véhicule', ButtonStyle.Success)))
    .addSeparatorComponents(separator());

  if (!vehicles.length) container.addTextDisplayComponents(text('Aucun véhicule enregistré.'));
  for (const group of pages[page]) {
    container.addSectionComponents(
      section(groupText(group), button(`veh:edit:${group.vehicles[0]._id}:${page}`, truncate(`Modifier : ${group.name}`, 80))),
    );
  }

  const row = [button(`veh:del:${page}`, 'Supprimer', ButtonStyle.Danger).setDisabled(!vehicles.length)];
  if (pages.length > 1) {
    row.push(
      button(`veh:page:${page - 1}`, 'Page précédente').setDisabled(page === 0),
      button(`veh:page:${page + 1}`, 'Page suivante').setDisabled(page === pages.length - 1),
    );
  }
  container.addSeparatorComponents(separator()).addActionRowComponents(new ActionRowBuilder().addComponents(row));
  return panelMessage(container);
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

const kmField = (value) =>
  textField('Kilométrage', FIELDS.km, {
    description: 'Kilométrage du prochain entretien',
    placeholder: 'Ex : 12500',
    maxLength: 12,
    value: value === undefined ? undefined : String(value),
  });

/** « Ajouter un véhicule » : nom, plaque, kilométrage du prochain entretien. */
const buildAddModal = (page) =>
  new ModalBuilder()
    .setCustomId(`veh:addsub:${page}`)
    .setTitle('Ajouter un véhicule')
    .addLabelComponents(
      textField('Nom du véhicule', FIELDS.name, { placeholder: 'Ex : Buffalo', maxLength: MAX_NAME_LENGTH }),
      textField("Plaque d'immatriculation", FIELDS.plate, {
        description: '8 caractères max (lettres, chiffres, espaces).',
        maxLength: MAX_PLATE_LENGTH,
      }),
      kmField(),
    );

/**
 * « Modifier : <nom> » : plaque (véhicules de ce type) et kilométrage du prochain entretien.
 * Plus de 25 véhicules de ce type : les plaques sont réparties dans plusieurs listes (une seule plaque à choisir).
 */
function buildEditModal(group, vehicleId, page) {
  const single = group.vehicles.length === 1 ? group.vehicles[0] : null;
  const chunks = [];
  for (let i = 0; i < Math.min(group.vehicles.length, MAX_OPTIONS * MAX_EDIT_SELECTS); i += MAX_OPTIONS) {
    chunks.push(group.vehicles.slice(i, i + MAX_OPTIONS));
  }
  const modal = new ModalBuilder().setCustomId(`veh:editsub:${vehicleId}:${page}`).setTitle(truncate(`Modifier : ${group.name}`, 45));
  chunks.forEach((chunk, i) => {
    const label = new LabelBuilder()
      .setLabel(chunks.length > 1 ? `Plaque (${i + 1}/${chunks.length})` : 'Plaque')
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId(PLATE_FIELDS[i])
          .setPlaceholder('Sélectionne la plaque')
          .setRequired(chunks.length === 1)
          .setMinValues(chunks.length === 1 ? 1 : 0)
          .setMaxValues(1)
          .addOptions(
            chunk.map((vehicle) => ({
              label: vehicle.plate,
              value: String(vehicle._id),
              description: `Prochain entretien : ${formatKm(vehicle.nextServiceKm)}`,
              default: vehicle === single,
            })),
          ),
      );
    if (chunks.length > 1 && i === 0) label.setDescription('Choisis une seule plaque, dans une des listes.');
    modal.addLabelComponents(label);
  });
  return modal.addLabelComponents(kmField(single?.nextServiceKm));
}

/** Plaques choisies dans le modal « Modifier : <nom> » (identifiants des véhicules). */
const getEditSelection = (interaction) => PLATE_FIELDS.flatMap((id) => interaction.fields.fields.get(id)?.values ?? []);

/** « Supprimer » : toutes les plaques, dans une ou plusieurs listes (25 par liste). */
const buildDeleteVehicleModal = (vehicles, page) =>
  buildDeleteModal({
    customId: `veh:delsub:${page}`,
    title: 'Supprimer des véhicules',
    label: 'Plaques',
    options: groupVehicles(vehicles)
      .flatMap((group) => group.vehicles)
      .map((vehicle) => ({
        label: vehicle.plate,
        value: String(vehicle._id),
        description: truncate(`${vehicle.name} • ${formatKm(vehicle.nextServiceKm)}`, 100),
      })),
  });

module.exports = {
  FIELDS,
  KM_ERROR,
  MAX_NAME_LENGTH,
  buildAddModal,
  buildDeleteVehicleModal,
  buildEditModal,
  formatKm,
  getEditSelection,
  getPlateError,
  groupVehicles,
  normalizePlate,
  parseKm,
  renderVehiclePanel,
  sameName,
};
