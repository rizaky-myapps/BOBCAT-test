const {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { MAX_PLATE_LENGTH, TENUES } = require('./constants');

/** Identifiants des champs des modals. */
const FIELDS = {
  day: 'jour',
  hour: 'heure',
  minute: 'minute',
  tenue: 'tenue',
  radio: 'radio',
  vehicle: 'vehicule',
  vehicleOther: 'vehicule_autre',
  supervisor: 'superviseur',
  supervisors: 'superviseurs',
  cancelReason: 'raison',
  cancelDetails: 'raison_autre',
  agents: 'agents',
  driver: 'conducteur',
  moto: 'u2r',
  replacePrefix: 'remplacer_',
  replacements: 'remplacants',
  mallettes: 'mallettes',
  photo: 'photo',
};

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

const vehicleOtherInput = (value, required) =>
  prefill(
    new TextInputBuilder()
      .setCustomId(FIELDS.vehicleOther)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex : XYZ 789')
      .setMaxLength(MAX_PLATE_LENGTH)
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

/** Heures (00 à 23) et minutes (par 5 : un menu Discord est limité à 25 choix) du modal « date et heure ». */
const HOUR_CHOICES = Array.from({ length: 24 }, (_, h) => ({ value: String(h).padStart(2, '0'), label: `${String(h).padStart(2, '0')} h` }));
const MINUTE_CHOICES = Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5).padStart(2, '0'), label: String(i * 5).padStart(2, '0') }));

/**
 * Modal « Informations générales » de l'aperçu /atm : tenue, radio, véhicule (et plaque si « Autre »).
 * @param {{ radios: object[], vehicles: object[] }} choices Radios et véhicules encore disponibles à cette heure-là.
 */
function buildInfoModal(draft, choices) {
  return new ModalBuilder()
    .setCustomId(`atm:infosub:${draft._id}`)
    .setTitle('Informations générales')
    .addLabelComponents(
      selectLabel('Choix de la tenue', FIELDS.tenue, TENUES, 'Sélectionne la tenue', draft.tenue),
      selectLabel('Fréquence radio', FIELDS.radio, choices.radios, 'Sélectionne la fréquence radio', draft.radio),
      selectLabel('Choix du véhicule', FIELDS.vehicle, choices.vehicles, 'Sélectionne le véhicule', draft.vehicle),
      new LabelBuilder()
        .setLabel('Plaque du véhicule (si « Autre »)')
        .setDescription('Uniquement si « Autre » est sélectionné : 8 caractères max (lettres, chiffres, espaces).')
        .setTextInputComponent(vehicleOtherInput(draft.plate, false)),
    );
}

/**
 * Modal « Choisir la date et l'heure » : date (aujourd'hui + 6 jours), heure, minutes.
 * @param {{ value: string, label: string }[]} days Jours proposés (cf. getUpcomingDays).
 * @param {{ day?: string, hour?: string, minute?: string }} selected Valeurs pré-sélectionnées.
 */
function buildDateModal(draft, days, selected = {}) {
  return new ModalBuilder()
    .setCustomId(`atm:datesub:${draft._id}`)
    .setTitle("Date et heure de la session")
    .addLabelComponents(
      selectLabel('Date', FIELDS.day, days, 'Sélectionne la date', selected.day),
      selectLabel('Heure', FIELDS.hour, HOUR_CHOICES, "Sélectionne l'heure", selected.hour),
      selectLabel('Minutes', FIELDS.minute, MINUTE_CHOICES, 'Sélectionne les minutes', selected.minute),
    );
}

/**
 * Modal « Sélectionner un superviseur ».
 * @param {{ label: string, value: string }[]} supervisors Superviseurs enregistrés en base.
 */
function buildSupervisorChoiceModal(draft, supervisors) {
  return new ModalBuilder()
    .setCustomId(`atm:supsub:${draft._id}`)
    .setTitle('Sélectionner un superviseur')
    .addLabelComponents(
      selectLabel('Choix du superviseur', FIELDS.supervisor, supervisors, 'Sélectionne le superviseur', draft.supervisorId),
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

/** Fichiers envoyés dans un champ « upload » d'un modal (le champ peut être absent s'il est laissé vide). */
function getUploadedFiles(interaction, customId) {
  if (!interaction.fields.fields.has(customId)) return [];
  return [...(interaction.fields.getUploadedFiles(customId)?.values() ?? [])];
}

module.exports = {
  FIELDS,
  getUploadedFiles,
  truncate,
  prefill,
  selectLabel,
  vehicleOtherInput,
  HOUR_CHOICES,
  MINUTE_CHOICES,
  buildInfoModal,
  buildDateModal,
  buildSupervisorChoiceModal,
  buildSupervisorModal,
};
