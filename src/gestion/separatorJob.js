const SeparatorChannel = require('../models/SeparatorChannel');
const SeparatorText = require('../models/SeparatorText');
const { config } = require('../config');
const { isDatabaseConnected } = require('../database/mongoose');
const { formatDate, formatDateTime, parseDateTime } = require('../utils/date');
const { logAction } = require('../utils/logger');

/** Envoi tous les dimanches à 23:59:59 (fuseau du .env). */
const SEND_DAY = 0; // dimanche
const SEND_TIME = '23:59';
const SEND_SECONDS = 59;

/** Prochain dimanche 23:59:59 (heure locale) strictement après `from`. */
function getNextSendTime(from = Date.now()) {
  const [day, month, year] = formatDate(new Date(from), config.timezone).split('/').map(Number);
  for (let i = 0; i <= 7; i++) {
    // Date calendaire à midi UTC : pas de décalage possible avec les changements d'heure.
    const date = new Date(Date.UTC(year, month - 1, day + i, 12));
    if (date.getUTCDay() !== SEND_DAY) continue;
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${SEND_TIME}`;
    const time = parseDateTime(local, config.timezone).getTime() + SEND_SECONDS * 1000;
    if (time > from) return new Date(time);
  }
  return null;
}

/** Lien vers un message. */
const messageUrl = (guildId, channelId, messageId) => `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

/**
 * Envoie le texte des séparateurs dans chaque salon de la liste. Si le dernier message du salon est déjà
 * le dernier séparateur envoyé par le bot, rien n'est reposté.
 */
async function sendSeparators(client) {
  const entries = await SeparatorChannel.find({});
  const texts = new Map();
  for (const entry of entries) {
    if (!texts.has(entry.guildId)) texts.set(entry.guildId, (await SeparatorText.findOne({ guildId: entry.guildId }))?.text ?? '');
    const text = texts.get(entry.guildId);
    if (!text) {
      logAction('Séparateurs', `Aucun texte choisi pour le serveur ${entry.guildId} : rien n'est envoyé dans ${entry.channelId}`);
      continue;
    }
    try {
      const channel = await client.channels.fetch(entry.channelId).catch(() => null);
      if (!channel?.isTextBased?.() || !channel.isSendable?.()) {
        console.warn(`[Séparateurs] Salon ${entry.channelId} introuvable ou inaccessible au bot.`);
        continue;
      }
      const [last] = [...(await channel.messages.fetch({ limit: 1 })).values()];
      if (last && entry.lastMessageId && last.id === entry.lastMessageId) {
        logAction('Séparateurs', `#${channel.name} : le dernier message est déjà le séparateur, rien n'est reposté`);
        continue;
      }
      // Texte seul (contenu du message, sans composant) ; les mentions éventuelles ne notifient personne.
      const message = await channel.send({ content: text, allowedMentions: { parse: [] } });
      await SeparatorChannel.updateOne({ _id: entry._id }, { $set: { lastMessageId: message.id, lastSentAt: new Date() } });
      logAction('Séparateurs', `Séparateur envoyé dans #${channel.name} : ${message.url}`);
    } catch (error) {
      console.error(`[Séparateurs] Envoi impossible dans ${entry.channelId} :`, error);
    }
  }
}

/** Programme l'envoi des séparateurs tous les dimanches à 23:59:59. */
function scheduleSeparators(client, from = Date.now()) {
  const next = getNextSendTime(from);
  logAction('Séparateurs', `Prochain envoi le ${formatDateTime(next, config.timezone)}:${SEND_SECONDS}`);
  setTimeout(async () => {
    try {
      if (isDatabaseConnected()) await sendSeparators(client);
      else console.warn('[Séparateurs] Base de données injoignable : envoi de cette semaine annulé.');
    } catch (error) {
      console.error('[Séparateurs] Erreur :', error);
    }
    // À partir de l'heure prévue (et non de l'heure actuelle) : jamais deux envois la même semaine.
    scheduleSeparators(client, next.getTime() + 1000);
  }, Math.max(0, next.getTime() - Date.now()));
}

module.exports = { getNextSendTime, messageUrl, scheduleSeparators, sendSeparators };
