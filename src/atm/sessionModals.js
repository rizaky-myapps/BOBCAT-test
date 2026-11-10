const {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { CANCEL_REASONS, MAX_MALLETTES, TENUES, VEHICLES, VEHICLE_OTHER } = require('./constants');
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
  const description = `Entre 1 et ${slots.maxAgents} : ${slots.vehicleSeats} dans le véhicule, le ${slots.maxAgents}e en U2R.`;
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
 * Modal « Dispatching » (2/2) : conducteur, et U2R si un agent part en moto.
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
    modal.addLabelComponents(selectLabel("Sélectionne l'U2R dans cette liste", FIELDS.moto, bikers, 'U2R'));
  }
  return modal;
}

/**
 * Modal « Dispatching » quand des agents sont déjà dispatchés : une raison par agent à remplacer
 * (champ laissé vide = l'agent est gardé).
 * @param {{ userId: string, name: string }[]} agents Agents dispatchés (hors CO-ATM et superviseur).
 */
function buildReplaceModal(session, agents) {
  return new ModalBuilder()
    .setCustomId(`atm:preplacesub:${session._id}`)
    .setTitle('Remplacer des agents')
    .addLabelComponents(
      agents.map((agent) =>
        new LabelBuilder()
          .setLabel(truncate(`Remplacer ${agent.name}`, 45))
          .setDescription('Raison du remplacement. Laisse vide pour garder cet agent.')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(`${FIELDS.replacePrefix}${agent.userId}`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex : plus disponible')
              .setMaxLength(200)
              .setRequired(false),
          ),
      ),
    );
}

/**
 * Modal « Choisir les remplaçants » : agents ayant voté, pas encore sur le dispatch.
 * @param {{ label: string, value: string }[]} options
 * @param {number} max Nombre maximum d'agents à ajouter.
 */
function buildReplacePickModal(session, options, max) {
  return new ModalBuilder()
    .setCustomId(`atm:preplacepicksub:${session._id}`)
    .setTitle('Choisir les remplaçants')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Remplaçants')
        .setDescription(truncate(`Jusqu'à ${max} agent(s) ayant voté « Je suis disponible ». Peut rester vide.`, 100))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(FIELDS.replacements)
            .setPlaceholder('Sélectionne les remplaçants')
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(Math.min(max, options.length))
            .addOptions(options),
        ),
    );
}

/**
 * Modal « Modifier les informations » du panneau ⚙️ : radio, véhicule et tenue.
 * @param {{ radios: object[], vehicles: object[] }} choices Radios et véhicules encore disponibles à cette heure-là.
 */
function buildSessionInfoModal(session, choices) {
  const preset = VEHICLES.find((vehicle) => vehicle.value !== VEHICLE_OTHER && vehicle.label === session.vehicle);
  return new ModalBuilder()
    .setCustomId(`atm:pinfosub:${session._id}`)
    .setTitle('Informations de la session')
    .addLabelComponents(
      selectLabel('Fréquence radio', FIELDS.radio, choices.radios, 'Sélectionne la fréquence radio', session.radio),
      selectLabel('Choix du véhicule', FIELDS.vehicle, choices.vehicles, 'Sélectionne le véhicule', preset?.value ?? VEHICLE_OTHER),
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
  buildReplaceModal,
  buildReplacePickModal,
  buildSessionInfoModal,
  buildPdsModal,
  buildPdsEditModal,
};
