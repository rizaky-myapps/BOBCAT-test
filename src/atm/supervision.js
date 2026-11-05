const { randomBytes } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const AtmDraft = require('../models/AtmDraft');
const { config } = require('../config');
const { RADIOS, SUPERVISOR_RESPONSE_DELAY, TENUES, findLabel } = require('./constants');
const { renderPreview } = require('./preview');
const { resolveVehicle } = require('./service');
const { toUnix } = require('../utils/date');
const { ephemeralText, separator } = require('../utils/v2');

/* ------------------------------------------------------------------ */
/* Message de demande dans le salon CO-ATM                             */
/* ------------------------------------------------------------------ */

const STATUS_LINES = {
  accepted: '✅ **Présence validée.**',
  refused: '❌ **Indisponible.**',
  expired: '⌛ **Pas de réponse dans les 10 minutes : demande refusée.**',
};

/**
 * Message (Components V2) informant le superviseur sélectionné.
 * @param {import('../models/AtmDraft')} draft
 * @param {{ id: string, supervisorId: string, status: string, expiresAt: Date }} request
 */
function renderSupervisionRequest(draft, request) {
  const ts = toUnix(draft.scheduledAt);
  const radio = RADIOS.find((item) => item.value === draft.radio)?.short ?? draft.radio;
  const pending = request.status === 'pending';

  const text = [
    '## Demande de supervision',
    `<@${request.supervisorId}>, <@${draft.userId}> t'a sélectionné comme superviseur pour une session ATM.`,
    '',
    `> **Date :** <t:${ts}:d>`,
    `> **Heure :** <t:${ts}:t> <t:${ts}:R>`,
    `> **Radio :** \`${radio}\``,
    `> **Tenue :** \`${findLabel(TENUES, draft.tenue)}\``,
    `> **Véhicule :** \`${resolveVehicle(draft.vehicle, draft.plate) ?? '...'}\``,
    '',
    pending
      ? `Es-tu disponible ? Sans réponse <t:${toUnix(request.expiresAt)}:R>, la demande sera considérée comme refusée.`
      : STATUS_LINES[request.status],
  ].join('\n');

  const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  if (pending) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sup:accept:${draft._id}:${request.id}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setLabel('Je suis disponible'),
        new ButtonBuilder()
          .setCustomId(`sup:refuse:${draft._id}:${request.id}`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
          .setLabel('Pas disponible'),
      ),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { users: [request.supervisorId] },
  };
}

async function fetchCoAtmChannel(client) {
  const channelId = config.channels.coAtm;
  if (!channelId) throw new Error("le salon CO-ATM n'est pas configuré (`BOBCAT_COATM_CHANNEL_ID` dans le .env)");
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`le salon CO-ATM (${channelId}) est introuvable ou inaccessible au bot`);
  }
  return channel;
}

/**
 * Envoie la demande au superviseur sélectionné dans le salon CO-ATM.
 * @returns {Promise<object>} La demande à enregistrer dans le brouillon.
 */
async function sendSupervisionRequest(client, draft) {
  const channel = await fetchCoAtmChannel(client);
  const request = {
    id: randomBytes(4).toString('hex'),
    supervisorId: draft.supervisorId,
    status: 'pending',
    channelId: channel.id,
    messageId: null,
    expiresAt: new Date(Date.now() + SUPERVISOR_RESPONSE_DELAY),
  };
  const message = await channel.send(renderSupervisionRequest(draft, request));
  request.messageId = message.id;
  return request;
}

/** Met à jour le message CO-ATM d'une demande (statut final, boutons retirés). */
async function updateRequestMessage(client, draft, request) {
  if (!request?.channelId || !request.messageId) return;
  try {
    const channel = await client.channels.fetch(request.channelId);
    await channel.messages.edit(request.messageId, renderSupervisionRequest(draft, request));
  } catch (error) {
    console.error('[Supervision] Mise à jour du message impossible :', error);
  }
}

/* ------------------------------------------------------------------ */
/* Aperçu du créateur                                                  */
/* ------------------------------------------------------------------ */

/** Dernière interaction ayant affiché l'aperçu de chaque brouillon (son jeton est valable 15 min). */
const previewWebhooks = new Map();
const WEBHOOK_LIFETIME = 14 * 60 * 1000;

/** À appeler après chaque réponse qui affiche l'aperçu (commande /atm, mise à jour par bouton ou modal). */
function rememberPreview(interaction, draft) {
  previewWebhooks.set(draft._id.toString(), {
    webhook: interaction.webhook,
    expiresAt: Date.now() + WEBHOOK_LIFETIME,
  });
}

/**
 * Met à jour l'aperçu du créateur et lui envoie un message (si l'aperçu est encore joignable).
 * Sinon, il retrouvera l'état à jour en relançant /atm (son brouillon est réutilisé).
 */
async function notifyCreator(client, draft, notice) {
  const id = draft._id.toString();
  const ref = previewWebhooks.get(id);
  if (!ref || ref.expiresAt < Date.now()) {
    previewWebhooks.delete(id);
    return;
  }
  const guild = client.guilds.cache.get(draft.guildId);
  try {
    if (guild) await ref.webhook.editMessage('@original', renderPreview(draft, guild));
    await ref.webhook.send(ephemeralText(notice));
  } catch (error) {
    console.error('[Supervision] Mise à jour de l’aperçu impossible :', error);
  }
}

/* ------------------------------------------------------------------ */
/* Réponses du superviseur                                             */
/* ------------------------------------------------------------------ */

/**
 * Passe une demande en attente à un statut final, de manière atomique.
 * En cas de refus ou d'absence de réponse, le superviseur est retiré du brouillon.
 * @returns {Promise<import('../models/AtmDraft')|null>} Le brouillon à jour, ou null si la demande n'était plus en attente.
 */
function resolveRequest(draftId, requestId, status) {
  const update = { 'supervisorRequest.status': status };
  if (status !== 'accepted') update.supervisorId = null;
  return AtmDraft.findOneAndUpdate(
    { _id: draftId, 'supervisorRequest.id': requestId, 'supervisorRequest.status': 'pending' },
    { $set: update },
    { returnDocument: 'after' },
  );
}

const CREATOR_NOTICES = {
  accepted: (id) => `✅ <@${id}> a validé sa présence. Tu peux envoyer la session.`,
  refused: (id) => `❌ <@${id}> n'est pas disponible. Sélectionne un autre superviseur via « Informations ».`,
  expired: (id) =>
    `⌛ <@${id}> n'a pas répondu dans les 10 minutes : demande refusée. Sélectionne un autre superviseur via « Informations ».`,
};

/** Prévient le créateur de la réponse du superviseur. */
function notifyResolution(client, draft) {
  const { status, supervisorId } = draft.supervisorRequest;
  return notifyCreator(client, draft, CREATOR_NOTICES[status](supervisorId));
}

/** Demandes sans réponse après 10 minutes : comptées comme refusées (appelé régulièrement). */
async function expirePendingRequests(client) {
  const pending = await AtmDraft.find({
    'supervisorRequest.status': 'pending',
    'supervisorRequest.expiresAt': { $lte: new Date() },
  });

  for (const draft of pending) {
    const updated = await resolveRequest(draft._id, draft.supervisorRequest.id, 'expired');
    if (!updated) continue;
    await updateRequestMessage(client, draft, updated.supervisorRequest);
    await notifyResolution(client, updated);
  }
}

module.exports = {
  renderSupervisionRequest,
  sendSupervisionRequest,
  rememberPreview,
  resolveRequest,
  notifyResolution,
  expirePendingRequests,
};
