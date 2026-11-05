const { config } = require('../config');
const { textMessage } = require('./v2');

/**
 * Envoie un message de log (Components V2) dans le salon BOBCAT_LOGS_CHANNEL_ID.
 * @param {import('discord.js').Client} client
 * @param {string} content
 */
async function sendLog(client, content) {
  const channelId = config.channels.logs;
  if (!channelId) {
    console.warn(`[Logs] BOBCAT_LOGS_CHANNEL_ID non configuré : ${content}`);
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send(textMessage(content));
  } catch (error) {
    console.error('[Logs] Envoi impossible :', error);
  }
}

module.exports = { sendLog };
