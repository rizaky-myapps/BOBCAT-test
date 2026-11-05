const {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { CANCEL_REASONS, MAX_MALLETTES, RADIOS, TENUES, VEHICLES, VEHICLE_OTHER } = require('./constants');
const { FIELDS, selectLabel, truncate, vehicleOtherInput } = require('./modals');

const MALLETTE_CHOICES = Array.from({ length: MAX_MALLETTES }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} mallette${i ? 's' : ''}`,
}));

/**
 * Modal « Annuler » : raison (liste) + précision obligatoire si « Autre ».
 * @param {string} source "panel" (panneau ⚙️) ou "check" (question du salon CO-ATM)
 */
function buildCancelModal(session, source) {
  return new ModalBuilder()
    .setCustomId(`atm:pcancelsub:${session._id}:${source}`)
    .setTitle('Annuler la session ATM')
    .addLabelComponents(
      selectLabel("Raison de l'annulation", FIELDS.cancelReason, CANCEL_REASONS, 'Sélectionne une raison'),
      new LabelBuilder()
        .setLabel('Raison « Autre »')
        .setDescription('Obligatoire si la raison sélectionnée est « Autre ».')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(FIELDS.cancelDetails)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Obligatoire si la raison est « Autre » : précise la raison ici.')
            .setMaxLength(300)
            .setRequired(false),
        ),
    );
}

/**
 * Modal « Dispatching » (1/2) : agents ayant voté « Je suis disponible ».
 * @param {{ label: string, value: string, default: boolean }[]} options
 * @param {{ vehicleSeats: number, maxAgents: number }} slots
 */
function buildDispatchModal(session, options, slots) {
  const description = `Entre 1 et ${slots.maxAgents} : ${slots.vehicleSeats} dans le véhicule, le ${slots.maxAgents}e en moto (rôle Unité 2 roues).`;
  return new ModalBuilder()
    .setCustomId(`atm:pdispatchsub:${session._id}`)
    .setTitle('Dispatching')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Agents sur la session')
        .setDescription(truncate(description, 100))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(FIELDS.agents)
            .setPlaceholder('Sélectionne les agents')
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(Math.min(slots.maxAgents, options.length))
            .addOptions(options),
        ),
    );
}

/**
 * Modal « Dispatching » (2/2) : conducteur, et motard si un agent part en moto.
 * @param {{ label: string, value: string }[]} agents Agents sélectionnés.
 * @param {{ label: string, value: string }[] | null} bikers Agents pouvant être en moto (null : pas de moto).
 */
function buildDriverModal(session, agents, bikers) {
  const modal = new ModalBuilder()
    .setCustomId(`atm:pdriversub:${session._id}`)
    .setTitle('Rôles des agents')
    .addLabelComponents(
      selectLabel('Sélectionne le conducteur dans cette liste', FIELDS.driver, agents, 'Conducteur'),
    );
  if (bikers) {
    modal.addLabelComponents(selectLabel('Sélectionne le motard dans cette liste', FIELDS.moto, bikers, 'Motard'));
  }
  return modal;
}

/** Modal « Informations » du panneau ⚙️ : radio, véhicule et tenue. */
function buildSessionInfoModal(session) {
  const preset = VEHICLES.find((vehicle) => vehicle.value !== VEHICLE_OTHER && vehicle.label === session.vehicle);
  return new ModalBuilder()
    .setCustomId(`atm:pinfosub:${session._id}`)
    .setTitle('Informations de la session')
    .addLabelComponents(
      selectLabel('Fréquence radio', FIELDS.radio, RADIOS, 'Sélectionne la fréquence radio', session.radio),
      selectLabel('Choix du véhicule', FIELDS.vehicle, VEHICLES, 'Sélectionne le véhicule', preset?.value ?? VEHICLE_OTHER),
      new LabelBuilder()
        .setLabel('Plaque du véhicule (si « Autre »)')
        .setDescription('À remplir uniquement si « Autre » est sélectionné ci-dessus.')
        .setTextInputComponent(vehicleOtherInput(preset ? '' : session.vehicle, false)),
      selectLabel('Choix de la tenue', FIELDS.tenue, TENUES, 'Sélectionne la tenue', session.tenue),
    );
}

const mallettesLabel = (selected) =>
  selectLabel('Nombre de mallettes utilisées', FIELDS.mallettes, MALLETTE_CHOICES, 'Sélectionne le nombre', selected);

const photoLabel = (label, description, required) =>
  new LabelBuilder()
    .setLabel(label)
    .setDescription(description)
    .setFileUploadComponent(
      new FileUploadBuilder()
        .setCustomId(FIELDS.photo)
        .setFileTypes('image')
        .setMinValues(required ? 1 : 0)
        .setMaxValues(1)
        .setRequired(required),
    );

/** Modal « Nouvelle PDS » : mallettes + photo de l'emplacement de l'ATM. */
function buildPdsModal(session) {
  return new ModalBuilder()
    .setCustomId(`atm:ppdssub:${session._id}`)
    .setTitle('Nouvelle PDS ATM')
    .addLabelComponents(
      mallettesLabel(),
      photoLabel("Emplacement de l'ATM", 'Photo de l’emplacement du distributeur.', true),
    );
}

/** Modal du bouton ✏️ d'une PDS : mallettes + nouvelle photo (facultative). */
function buildPdsEditModal(pds) {
  return new ModalBuilder()
    .setCustomId(`pds:editsub:${pds._id}`)
    .setTitle('Modifier la PDS ATM')
    .addLabelComponents(
      mallettesLabel(String(pds.mallettes)),
      photoLabel("Nouvelle photo de l'emplacement", 'Laisse vide pour garder la photo actuelle.', false),
    );
}

module.exports = {
  MALLETTE_CHOICES,
  buildCancelModal,
  buildDispatchModal,
  buildDriverModal,
  buildSessionInfoModal,
  buildPdsModal,
  buildPdsEditModal,
};
