require('dotenv').config({ quiet: true });

const splitIds = (value) =>
  (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID || null,
  },
  atm: {
    channelId: process.env.ATM_CHANNEL_ID,
    pingRoleId: process.env.ATM_PING_ROLE_ID || null,
    supervisorRoleId: process.env.ATM_SUPERVISOR_ROLE_ID || null,
    managerRoleIds: splitIds(process.env.ATM_MANAGER_ROLE_IDS),
    timezone: process.env.TIMEZONE || 'Europe/Paris',
  },
  mongo: {
    uri: process.env.MONGODB_URI,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'bobcat/atm',
  },
};

/**
 * Vérifie que les variables d'environnement indispensables sont présentes.
 * @param {string[]} keys Chemins des clés à vérifier (ex: "discord.token").
 */
function assertConfig(keys) {
  const missing = keys.filter((key) => !key.split('.').reduce((obj, part) => obj?.[part], config));
  if (missing.length) {
    throw new Error(`Configuration manquante dans le fichier .env : ${missing.join(', ')}`);
  }
}

module.exports = { config, assertConfig };
