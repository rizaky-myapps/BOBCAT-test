const {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  AGENT_ROLES,
  PING_CHOICES,
  RADIOS,
  TENUES,
  VEHICLES,
  VEHICLE_OTHER,
} = require('./constants');
const { encodeDraft } = require('./draft');
const { formatDateTime } = require('../utils/date');

/** Identifiants des champs des modals. */
const FIELDS = {
  date: 'date',
  tenue: 'tenue',
  radio: 'radio',
  vehicle: 'vehicule',
  vehicleOther: 'vehicule_autre',
  ping: 'ping',
  photos: 'photos',
  rolePrefix: 'role_',
};

const DATE_PLACEHOLDER = 'JJ/MM/AAAA HH:MM (ex : 31/10/2026 21:00)';

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Pré-remplit un champ texte uniquement si la valeur respecte ses limites :
 * Discord refuse le modal entier si la valeur est vide ou hors limites
 * (ex : "" sur un champ avec une longueur minimale).
 */
function prefill(input, value) {
  const { min_length: min = 0, max_length: max = 4000 } = input.data;
  if (value && value.length >= Math.max(min, 1) && value.length <= max) input.setValue(value);
  return input;
}

const dateLabel = (value) =>
  new LabelBuilder()
    .setLabel('Date & Heure')
    .setDescription('Format : JJ/MM/AAAA HH:MM')
    .setTextInputComponent(
      prefill(
        new TextInputBuilder()
          .setCustomId(FIELDS.date)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(DATE_PLACEHOLDER)
          .setMinLength(10)
          .setMaxLength(20)
          .setRequired(true),
        value,
      ),
    );

const vehicleOtherInput = (value, required) =>
  prefill(
    new TextInputBuilder()
      .setCustomId(FIELDS.vehicleOther)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex : XYZ 789')
      .setMaxLength(32)
      .setRequired(required),
    value,
  );

const selectLabel = (label, customId, choices, placeholder, selected) =>
  new LabelBuilder()
    .setLabel(label)
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setRequired(true)
        .addOptions(
          choices.map((choice) => ({
            label: choice.label,
            value: choice.value,
            default: choice.value === selected,
          })),
        ),
    );

/** Modal ouvert par /atm. */
function buildCreateModal() {
  return new ModalBuilder()
    .setCustomId('atm:create')
    .setTitle('Nouvelle session ATM')
    .addLabelComponents(
      dateLabel(),
      selectLabel('Choix de la tenue', FIELDS.tenue, TENUES, 'Sélectionne la tenue'),
      selectLabel('Fréquence radio', FIELDS.radio, RADIOS, 'Sélectionne la fréquence radio'),
      selectLabel('Choix du véhicule', FIELDS.vehicle, VEHICLES, 'Sélectionne le véhicule'),
      selectLabel('Ping employés ?', FIELDS.ping, PING_CHOICES, 'Mentionner les employés ?'),
    );
}

/**
 * 2e modal : demande le véhicule (option « Autre ») et/ou une date corrigée.
 * @param {ReturnType<import('./draft').decodeDraft>} draft
 * @param {{ needDate: boolean, needVehicle: boolean }} needs
 */
function buildDetailsModal(draft, { needDate, needVehicle }) {
  const modal = new ModalBuilder()
    .setCustomId(`atm:moresub:${encodeDraft(draft)}`)
    .setTitle(needVehicle ? 'Véhicule utilisé' : 'Correction de la date');

  if (needDate) modal.addLabelComponents(dateLabel(draft.rawDate));
  if (needVehicle) {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel('Véhicule utilisé')
        .setDescription('Renseigne le véhicule (modèle / plaque) utilisé pour la session.')
        .setTextInputComponent(vehicleOtherInput('', true)),
    );
  }
  return modal;
}

/** Modal « Modifier les infos » (bouton du panneau ⚙️). */
function buildEditModal(session, timeZone) {
  const presetVehicle = VEHICLES.find((v) => v.value !== VEHICLE_OTHER && v.label === session.vehicle);

  return new ModalBuilder()
    .setCustomId(`atm:editsub:${session._id}`)
    .setTitle('Modifier la session ATM')
    .addLabelComponents(
      dateLabel(formatDateTime(session.scheduledAt, timeZone)),
      selectLabel('Choix de la tenue', FIELDS.tenue, TENUES, 'Sélectionne la tenue', session.tenue),
      selectLabel('Fréquence radio', FIELDS.radio, RADIOS, 'Sélectionne la fréquence radio', session.radio),
      selectLabel(
        'Choix du véhicule',
        FIELDS.vehicle,
        VEHICLES,
        'Sélectionne le véhicule',
        presetVehicle?.value ?? VEHICLE_OTHER,
      ),
      new LabelBuilder()
        .setLabel('Véhicule (si « Autre »)')
        .setDescription('À remplir uniquement si « Autre » est sélectionné ci-dessus.')
        .setTextInputComponent(vehicleOtherInput(presetVehicle ? '' : session.vehicle, false)),
    );
}

/** Modal « Rôles des agents » : un menu de rôles par agent sur dispatch. */
function buildRolesModal(session) {
  return new ModalBuilder()
    .setCustomId(`atm:rolessub:${session._id}`)
    .setTitle('Rôles des agents sur dispatch')
    .addLabelComponents(
      session.dispatch.map((agent) =>
        new LabelBuilder().setLabel(truncate(agent.name || `Agent ${agent.userId}`, 45)).setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(`${FIELDS.rolePrefix}${agent.userId}`)
            .setPlaceholder('Aucun rôle')
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(AGENT_ROLES.length)
            .addOptions(
              AGENT_ROLES.map((role) => ({
                label: role.label,
                value: role.value,
                emoji: role.emoji,
                default: agent.roles.includes(role.value),
              })),
            ),
        ),
      ),
    );
}

/** Modal « Ajouter des photos » (upload vers Cloudinary). */
function buildPhotoModal(session, remaining) {
  return new ModalBuilder()
    .setCustomId(`atm:photosub:${session._id}`)
    .setTitle('Ajouter des photos')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Photos de la session')
        .setDescription(`Images uniquement — ${remaining} maximum.`)
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId(FIELDS.photos)
            .setFileTypes('image')
            .setMinValues(1)
            .setMaxValues(remaining)
            .setRequired(true),
        ),
    );
}

module.exports = {
  FIELDS,
  buildCreateModal,
  buildDetailsModal,
  buildEditModal,
  buildRolesModal,
  buildPhotoModal,
};
