const { isValidObjectId } = require('mongoose');
const Vehicle = require('../models/Vehicle');
const PatrolPlace = require('../models/PatrolPlace');
const SeparatorChannel = require('../models/SeparatorChannel');
const SeparatorText = require('../models/SeparatorText');
const vehicles = require('../gestion/vehicles');
const places = require('../gestion/places');
const separators = require('../gestion/separators');
const { openSupervisorModal } = require('../gestion/supervisors');
const { ephemeralPanel, getDeleteSelection, normalizeSpaces } = require('../gestion/ui');
const { ephemeralText } = require('../utils/v2');
const { logAction, who } = require('../utils/logger');
const EMOJI = require('../emoji');

/** Erreur MongoDB « clé en double » (index unique). */
const isDuplicate = (error) => error?.code === 11000;

/* ------------------------------------------------------------------ */
/* Boutons du message /gestion : chacun ouvre son panneau (éphémère)   */
/* ------------------------------------------------------------------ */

const handleMenuPlaces = async (interaction) => interaction.reply(ephemeralPanel(await places.renderPlacePanel(interaction.guildId)));
const handleMenuVehicles = async (interaction) =>
  interaction.reply(ephemeralPanel(await vehicles.renderVehiclePanel(interaction.guildId)));
const handleMenuSupervisors = (interaction) => openSupervisorModal(interaction);
const handleMenuSeparators = async (interaction) =>
  interaction.reply(ephemeralPanel(await separators.renderSeparatorPanel(interaction.guild)));
const handleMenuUpr = (interaction) =>
  interaction.reply(ephemeralText(`${EMOJI.INFO} Agents UPR : cette partie sera définie plus tard.`));

/* ------------------------------------------------------------------ */
/* Véhicules                                                           */
/* ------------------------------------------------------------------ */

const updateVehiclePanel = async (interaction, options) =>
  interaction.update(await vehicles.renderVehiclePanel(interaction.guildId, options));

const handleVehiclePage = (interaction, [page]) => updateVehiclePanel(interaction, { page: Number(page) });

async function handleVehicleAddButton(interaction, [page]) {
  const names = vehicles.groupVehicles(await Vehicle.find({ guildId: interaction.guildId })).map((group) => group.name);
  return interaction.showModal(vehicles.buildAddModal(page, names));
}

async function handleVehicleAddModal(interaction, [page]) {
  const { fields } = interaction;
  const [nameChoice] = fields.getStringSelectValues(vehicles.FIELDS.name);
  const isOther = nameChoice === vehicles.NAME_OTHER;
  const rawName = isOther ? normalizeSpaces(fields.getTextInputValue(vehicles.FIELDS.otherName)) : normalizeSpaces(nameChoice);
  const plate = vehicles.normalizePlate(fields.getTextInputValue(vehicles.FIELDS.plate));
  const km = vehicles.parseKm(fields.getTextInputValue(vehicles.FIELDS.km));
  const [tag = null] = fields.fields.get(vehicles.FIELDS.tag)?.values ?? [];

  if (!rawName) {
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Tu as choisi « Autre » : écris le nom du véhicule dans le champ prévu.`));
  }
  const plateError = vehicles.getPlateError(plate);
  if (plateError) return interaction.reply(ephemeralText(plateError));
  if (km === null) return interaction.reply(ephemeralText(vehicles.KM_ERROR));
  if (tag && !vehicles.TAGS.some((item) => item.value === tag)) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Tag invalide.`));

  // Même nom qu'un véhicule existant (majuscules / accents près) : regroupé sous le nom existant.
  const existing = await Vehicle.find({ guildId: interaction.guildId });
  const name = existing.find((vehicle) => vehicles.sameName(vehicle.name, rawName))?.name ?? rawName;

  try {
    await Vehicle.create({ guildId: interaction.guildId, name, plate, nextServiceKm: km, tag });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} La plaque \`${plate}\` est déjà enregistrée.`));
  }
  logAction('BDD', `Création dans Vehicule-List : ${name} ${plate} (prochain entretien ${km} km${tag ? `, tag ${tag}` : ''}) par ${who(interaction)}`);
  return updateVehiclePanel(interaction, { page: Number(page), focus: name });
}

/** Véhicule de ce serveur, ou null. */
async function findVehicle(interaction, id) {
  return isValidObjectId(id) ? Vehicle.findOne({ _id: id, guildId: interaction.guildId }) : null;
}

async function handleVehicleEditButton(interaction, [vehicleId, page]) {
  const vehicle = await findVehicle(interaction, vehicleId);
  if (!vehicle) {
    await updateVehiclePanel(interaction, { page: Number(page) });
    return interaction.followUp(ephemeralText(`${EMOJI.ERREUR} Ce véhicule n'existe plus : la liste a été mise à jour.`));
  }
  const all = await Vehicle.find({ guildId: interaction.guildId });
  const group = vehicles.groupVehicles(all).find((item) => vehicles.sameName(item.name, vehicle.name));
  return interaction.showModal(vehicles.buildEditModal(group, vehicleId, page));
}

async function handleVehicleEditModal(interaction, [, page]) {
  const selection = vehicles.getEditSelection(interaction);
  if (selection.length !== 1) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Choisis une seule plaque.`));
  const [selectedId] = selection;
  const km = vehicles.parseKm(interaction.fields.getTextInputValue(vehicles.FIELDS.km));
  if (km === null) return interaction.reply(ephemeralText(vehicles.KM_ERROR));

  const vehicle = isValidObjectId(selectedId)
    ? await Vehicle.findOneAndUpdate(
        { _id: selectedId, guildId: interaction.guildId },
        { $set: { nextServiceKm: km } },
        { returnDocument: 'after' },
      )
    : null;
  if (!vehicle) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Ce véhicule n'existe plus.`));
  logAction('BDD', `Modification dans Vehicule-List : ${vehicle.name} ${vehicle.plate} → prochain entretien ${km} km par ${who(interaction)}`);
  return updateVehiclePanel(interaction, { page: Number(page) });
}

async function handleVehicleDeleteButton(interaction, [page]) {
  const all = await Vehicle.find({ guildId: interaction.guildId });
  if (!all.length) return updateVehiclePanel(interaction, { page: Number(page) });
  return interaction.showModal(vehicles.buildDeleteVehicleModal(all, page));
}

async function handleVehicleDeleteModal(interaction, [page]) {
  const ids = getDeleteSelection(interaction).filter(isValidObjectId);
  if (ids.length) {
    const deleted = await Vehicle.find({ _id: { $in: ids }, guildId: interaction.guildId });
    await Vehicle.deleteMany({ _id: { $in: ids }, guildId: interaction.guildId });
    if (deleted.length) {
      logAction('BDD', `Suppression dans Vehicule-List : ${deleted.map((v) => `${v.name} ${v.plate}`).join(', ')} par ${who(interaction)}`);
    }
  }
  return updateVehiclePanel(interaction, { page: Number(page) });
}

/* ------------------------------------------------------------------ */
/* Lieux de patrouille                                                 */
/* ------------------------------------------------------------------ */

const updatePlacePanel = async (interaction) => interaction.update(await places.renderPlacePanel(interaction.guildId));

const handlePlaceAddButton = (interaction) => interaction.showModal(places.buildAddPlaceModal());

async function handlePlaceAddModal(interaction) {
  const { fields } = interaction;
  const name = normalizeSpaces(fields.getTextInputValue(places.FIELDS.name));
  const emoji = fields.getTextInputValue(places.FIELDS.emoji).replace(/\s+/g, '');
  const weeklyMaxMinutes = places.parseDuration(fields.getTextInputValue(places.FIELDS.weekly));
  const [when] = fields.getStringSelectValues(places.FIELDS.when);
  const [visit] = fields.getStringSelectValues(places.FIELDS.visit);

  let error = null;
  if (!name) error = `${EMOJI.ERREUR} Renseigne le nom de l'entreprise / du lieu.`;
  else if (!places.isEmoji(emoji)) error = `${EMOJI.ERREUR} « Emoji du lieu » : indique un seul émoji (ex : 🏦) ou un émoji du serveur au format \`<:nom:id>\`.`;
  else if (weeklyMaxMinutes === null) error = `${EMOJI.ERREUR} « Temps max / semaine » : indique une durée, ex : 2h, 1h30 ou 45min (une semaine maximum).`;
  else if (!places.WHEN_CHOICES.some((choice) => choice.value === when) || !places.VISIT_CHOICES.some((choice) => choice.value === visit)) {
    error = `${EMOJI.ERREUR} Réponses invalides, réessaie.`;
  }
  if (error) return interaction.reply(ephemeralText(`${error}\nLe lieu n'a pas été ajouté.`));

  try {
    await PatrolPlace.create({
      guildId: interaction.guildId,
      name,
      nameKey: name.toLocaleLowerCase('fr'),
      emoji,
      weeklyMaxMinutes,
      when,
      visitMaxMinutes: Number(visit),
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Le lieu « ${name} » est déjà enregistré.`));
  }
  logAction('BDD', `Création dans Lieu-Patrouille-List : ${emoji} ${name} (${when}, ${weeklyMaxMinutes} min / semaine, ${visit} min / passage) par ${who(interaction)}`);
  return updatePlacePanel(interaction);
}

async function handlePlaceDeleteButton(interaction) {
  const all = await PatrolPlace.find({ guildId: interaction.guildId });
  if (!all.length) return updatePlacePanel(interaction);
  return interaction.showModal(places.buildDeletePlaceModal(all));
}

async function handlePlaceDeleteModal(interaction) {
  const ids = getDeleteSelection(interaction).filter(isValidObjectId);
  if (ids.length) {
    const deleted = await PatrolPlace.find({ _id: { $in: ids }, guildId: interaction.guildId });
    await PatrolPlace.deleteMany({ _id: { $in: ids }, guildId: interaction.guildId });
    if (deleted.length) {
      logAction('BDD', `Suppression dans Lieu-Patrouille-List : ${deleted.map((p) => p.name).join(', ')} par ${who(interaction)}`);
    }
  }
  return updatePlacePanel(interaction);
}

/* ------------------------------------------------------------------ */
/* Séparateurs                                                         */
/* ------------------------------------------------------------------ */

const updateSeparatorPanel = async (interaction) => interaction.update(await separators.renderSeparatorPanel(interaction.guild));

const handleSeparatorAddButton = (interaction) => interaction.showModal(separators.buildAddSeparatorModal());

async function handleSeparatorAddModal(interaction) {
  const ids = interaction.fields.fields.get(separators.CHANNELS_FIELD)?.values ?? [];
  if (ids.length) {
    await SeparatorChannel.bulkWrite(
      ids.map((channelId) => ({
        updateOne: {
          filter: { guildId: interaction.guildId, channelId },
          update: { $setOnInsert: { guildId: interaction.guildId, channelId } },
          upsert: true,
        },
      })),
    );
    logAction('BDD', `Ajout dans Separateur-List : ${ids.join(', ')} par ${who(interaction)}`);
  }
  return updateSeparatorPanel(interaction);
}

async function handleSeparatorDeleteButton(interaction) {
  const channels = await separators.getSeparatorChannels(interaction.guild);
  if (!channels.length) return updateSeparatorPanel(interaction);
  return interaction.showModal(separators.buildDeleteSeparatorModal(channels));
}

async function handleSeparatorDeleteModal(interaction) {
  const ids = getDeleteSelection(interaction);
  if (ids.length) {
    const { deletedCount } = await SeparatorChannel.deleteMany({ guildId: interaction.guildId, channelId: { $in: ids } });
    if (deletedCount) logAction('BDD', `Suppression dans Separateur-List : ${ids.join(', ')} par ${who(interaction)}`);
  }
  return updateSeparatorPanel(interaction);
}

async function handleSeparatorTextButton(interaction) {
  return interaction.showModal(separators.buildSeparatorTextModal(await separators.getSeparatorText(interaction.guildId)));
}

async function handleSeparatorTextModal(interaction) {
  const value = interaction.fields.getTextInputValue(separators.TEXT_FIELD).trim();
  if (!value) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Le texte ne peut pas être vide.`));
  await SeparatorText.findOneAndUpdate({ guildId: interaction.guildId }, { $set: { text: value } }, { upsert: true });
  logAction('BDD', `Texte des séparateurs modifié par ${who(interaction)} (${value.length} caractères)`);
  return updateSeparatorPanel(interaction);
}

module.exports = {
  handleMenuPlaces,
  handleMenuVehicles,
  handleMenuSupervisors,
  handleMenuSeparators,
  handleMenuUpr,
  handleVehiclePage,
  handleVehicleAddButton,
  handleVehicleAddModal,
  handleVehicleEditButton,
  handleVehicleEditModal,
  handleVehicleDeleteButton,
  handleVehicleDeleteModal,
  handlePlaceAddButton,
  handlePlaceAddModal,
  handlePlaceDeleteButton,
  handlePlaceDeleteModal,
  handleSeparatorAddButton,
  handleSeparatorAddModal,
  handleSeparatorDeleteButton,
  handleSeparatorDeleteModal,
  handleSeparatorTextButton,
  handleSeparatorTextModal,
};
