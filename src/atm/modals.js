const {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { AGENT_ROLES, RADIOS, TENUES, VEHICLES, VEHICLE_OTHER } = require('./constants');
const { formatDateTime } = require('../utils/date');

/** Identifiants des champs des modals. */
const FIELDS = {
  date: 'date',
  tenue: 'tenue',
  radio: 'radio',
  vehicle: 'vehicule',
  vehicleOther: 'vehicule_autre',
  supervisor: 'superviseur',
  supervisors: 'superviseurs',
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

/**
 * Modal « Informations » de l'aperçu /atm (5 questions), pré-rempli avec le brouillon.
 * @param {import('../models/AtmDraft')} draft
 * @param {{ label: string, value: string }[]} supervisors Superviseurs enregistrés en base.
 */
function buildInfoModal(draft, supervisors) {
  return new ModalBuilder()
    .setCustomId(`atm:infosub:${draft._id}`)
    .setTitle('Nouvelle session ATM')
    .addLabelComponents(
      dateLabel(draft.rawDate),
      selectLabel('Choix de la tenue', FIELDS.tenue, TENUES, 'Sélectionne la tenue', draft.tenue),
      selectLabel('Fréquence radio', FIELDS.radio, RADIOS, 'Sélectionne la fréquence radio', draft.radio),
      selectLabel('Choix du véhicule', FIELDS.vehicle, VEHICLES, 'Sélectionne le véhicule', draft.vehicle),
      selectLabel(
        'Choix du superviseur',
        FIELDS.supervisor,
        supervisors,
        'Sélectionne le superviseur',
        draft.supervisorId,
      ),
    );
}

/** Modal « Choisir la plaque » (véhicule « Autre »). */
function buildPlateModal(draft) {
  return new ModalBuilder()
    .setCustomId(`atm:platesub:${draft._id}`)
    .setTitle('Véhicule utilisé')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Plaque du véhicule')
        .setDescription('Renseigne la plaque du véhicule utilisé pour la session.')
        .setTextInputComponent(vehicleOtherInput(draft.plate, true)),
    );
}

/**
 * Modal de /superviseur : liste des membres ayant le rôle superviseur.
 * Les superviseurs déjà enregistrés sont pré-sélectionnés.
 * @param {{ label: string, value: string, description?: string, default: boolean }[]} options
 * @param {string} roleName
 */
function buildSupervisorModal(options, roleName) {
  return new ModalBuilder()
    .setCustomId('sup:save')
    .setTitle('Superviseurs')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Liste des superviseurs')
        .setDescription(truncate(`Membres ayant le rôle « ${roleName} »`, 100))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(FIELDS.supervisors)
            .setPlaceholder('Sélectionne les superviseurs')
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options),
        ),
    );
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
  truncate,
  buildInfoModal,
  buildPlateModal,
  buildSupervisorModal,
  buildEditModal,
  buildRolesModal,
  buildPhotoModal,
};
