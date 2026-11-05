const AtmSession = require('../models/AtmSession');
const { config } = require('../config');
const {
  AGENT_ROLES,
  DISPATCH_MAX,
  MAX_PHOTOS,
  RADIOS,
  STATUSES,
  TENUES,
  findLabel,
} = require('../atm/constants');
const { FIELDS, buildEditModal, buildPhotoModal, buildRolesModal } = require('../atm/modals');
const { renderPanel } = require('../atm/panel');
const { canManageSession, findSession, resolveVehicle, syncSessionMessage } = require('../atm/service');
const { deleteImage, isCloudinaryEnabled, uploadImageFromUrl } = require('../services/cloudinary');
const { parseDateTime } = require('../utils/date');
const { ephemeralText: ephemeral } = require('../utils/v2');
const AFTER = { returnDocument: 'after' };

/** Charge la session et vérifie les droits ; répond à l'utilisateur et renvoie null sinon. */
async function loadManageable(interaction, id) {
  const session = await findSession(id);
  if (!session) {
    await interaction.reply(ephemeral('❌ Cette session est introuvable (supprimée ?).'));
    return null;
  }
  if (!canManageSession(interaction, session)) {
    await interaction.reply(ephemeral('⛔ Tu ne peux pas gérer cette session.'));
    return null;
  }
  return session;
}

/** Enregistre la modification, met à jour l'annonce publique et le panneau. */
async function applyUpdate(interaction, id, update, notice) {
  const session = await AtmSession.findByIdAndUpdate(id, update, AFTER);
  await syncSessionMessage(interaction.client, session);
  const payload = renderPanel(session, notice);
  return interaction.deferred ? interaction.editReply(payload) : interaction.update(payload);
}

/* ------------------------------------------------------------------ */
/* Dispatch & statut                                                   */
/* ------------------------------------------------------------------ */

/** Menu « Agents sur dispatch » (sélecteur d'utilisateurs). */
async function handleDispatchSelect(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  const previous = new Map(session.dispatch.map((agent) => [agent.userId, agent]));
  const selected = interaction.values.filter((userId) => !interaction.users.get(userId)?.bot);

  // On garde l'ordre existant, les nouveaux agents sont ajoutés à la suite.
  const ordered = [
    ...session.dispatch.map((agent) => agent.userId).filter((userId) => selected.includes(userId)),
    ...selected.filter((userId) => !previous.has(userId)),
  ].slice(0, DISPATCH_MAX);

  const dispatch = ordered.map((userId) => {
    const member = interaction.members?.get(userId);
    const user = interaction.users.get(userId);
    return {
      userId,
      name: member?.displayName ?? member?.nick ?? user?.displayName ?? previous.get(userId)?.name ?? '',
      roles: previous.get(userId)?.roles ?? [],
    };
  });

  const ignoredBots = interaction.values.length - selected.length;
  const notice = `✅ Dispatch mis à jour (${dispatch.length}/${DISPATCH_MAX}).${
    ignoredBots ? ' Les bots ont été ignorés.' : ''
  }${dispatch.length ? ' Utilise « Rôles des agents » pour leur attribuer un rôle.' : ''}`;

  return applyUpdate(interaction, session._id, { $set: { dispatch } }, notice);
}

/** Menu « Statut de la session ». */
async function handleStatusSelect(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  const [status] = interaction.values;
  if (!STATUSES.some((item) => item.value === status)) return interaction.deferUpdate();

  return applyUpdate(
    interaction,
    session._id,
    { $set: { status } },
    `✅ Statut mis à jour : \`${findLabel(STATUSES, status)}\`.`,
  );
}

/* ------------------------------------------------------------------ */
/* Rôles des agents                                                    */
/* ------------------------------------------------------------------ */

async function handleRolesButton(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;
  if (!session.dispatch.length) {
    return interaction.reply(ephemeral("ℹ️ Ajoute d'abord des agents sur le dispatch."));
  }
  return interaction.showModal(buildRolesModal(session));
}

async function handleRolesModal(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  const validRoles = AGENT_ROLES.map((role) => role.value);
  const dispatch = session.dispatch.map((agent) => {
    const fieldId = `${FIELDS.rolePrefix}${agent.userId}`;
    let roles = [...agent.roles];
    if (interaction.fields.fields.has(fieldId)) {
      roles = (interaction.fields.fields.get(fieldId).values ?? []).filter((role) => validRoles.includes(role));
    }
    return { userId: agent.userId, name: agent.name, roles };
  });

  return applyUpdate(interaction, session._id, { $set: { dispatch } }, '✅ Rôles des agents mis à jour.');
}

/* ------------------------------------------------------------------ */
/* Modification des informations                                       */
/* ------------------------------------------------------------------ */

async function handleEditButton(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;
  return interaction.showModal(buildEditModal(session, config.atm.timezone));
}

async function handleEditModal(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  const { fields } = interaction;
  const rawDate = fields.getTextInputValue(FIELDS.date).trim();
  const [tenue] = fields.getStringSelectValues(FIELDS.tenue);
  const [radio] = fields.getStringSelectValues(FIELDS.radio);
  const [vehicleChoice] = fields.getStringSelectValues(FIELDS.vehicle);
  const vehicle = resolveVehicle(vehicleChoice, fields.getTextInputValue(FIELDS.vehicleOther));
  const scheduledAt = parseDateTime(rawDate, config.atm.timezone);

  let error = null;
  if (!scheduledAt) error = `❌ La date \`${rawDate}\` est invalide (format : \`JJ/MM/AAAA HH:MM\`).`;
  else if (!vehicle) error = '❌ Tu as choisi **Autre** : renseigne le véhicule dans le dernier champ.';
  else if (!TENUES.some((t) => t.value === tenue) || !RADIOS.some((r) => r.value === radio)) {
    error = '❌ Réponses invalides.';
  }
  if (error) return interaction.update(renderPanel(session, `${error}\nAucune modification enregistrée.`));

  return applyUpdate(
    interaction,
    session._id,
    { $set: { scheduledAt, tenue, radio, vehicle } },
    '✅ Informations de la session mises à jour.',
  );
}

/* ------------------------------------------------------------------ */
/* Photos (Cloudinary)                                                 */
/* ------------------------------------------------------------------ */

async function handlePhotoButton(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;
  if (!isCloudinaryEnabled()) return interaction.reply(ephemeral("❌ Cloudinary n'est pas configuré."));

  const remaining = MAX_PHOTOS - session.photos.length;
  if (remaining <= 0) return interaction.reply(ephemeral(`❌ Limite de ${MAX_PHOTOS} photos atteinte.`));
  return interaction.showModal(buildPhotoModal(session, remaining));
}

async function handlePhotoModal(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  // L'envoi vers Cloudinary peut dépasser les 3 secondes accordées par Discord.
  await interaction.deferUpdate();

  const files = [...(interaction.fields.getUploadedFiles(FIELDS.photos)?.values() ?? [])];
  const images = files.filter((file) => file.contentType?.startsWith('image/'));
  const accepted = images.slice(0, Math.max(0, MAX_PHOTOS - session.photos.length));

  const results = await Promise.allSettled(
    accepted.map((file) => uploadImageFromUrl(file.url, session._id.toString())),
  );
  const photos = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => ({ ...result.value, uploadedBy: interaction.user.id }));
  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('[Cloudinary] Envoi impossible :', result.reason));

  const skipped = files.length - photos.length;
  const notice = [
    photos.length ? `📸 ${photos.length} photo(s) ajoutée(s).` : '❌ Aucune photo ajoutée.',
    skipped ? `⚠️ ${skipped} fichier(s) ignoré(s) (format non supporté, limite atteinte ou erreur d'envoi).` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return applyUpdate(interaction, session._id, { $push: { photos: { $each: photos } } }, notice);
}

async function handlePhotoClearButton(interaction, [id]) {
  const session = await loadManageable(interaction, id);
  if (!session) return;

  await interaction.deferUpdate();
  const results = await Promise.allSettled(session.photos.map((photo) => deleteImage(photo.publicId)));
  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('[Cloudinary] Suppression impossible :', result.reason));

  const removedIds = session.photos.map((photo) => photo.publicId);
  return applyUpdate(
    interaction,
    session._id,
    { $pull: { photos: { publicId: { $in: removedIds } } } },
    `🧹 ${removedIds.length} photo(s) retirée(s).`,
  );
}

module.exports = {
  handleDispatchSelect,
  handleStatusSelect,
  handleRolesButton,
  handleRolesModal,
  handleEditButton,
  handleEditModal,
  handlePhotoButton,
  handlePhotoModal,
  handlePhotoClearButton,
};
