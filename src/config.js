require('dotenv').config({ quiet: true });

const env = (key) => process.env[key] || null;

/** Entier strictement positif, sinon la valeur par défaut. */
function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

const config = {
  discord: {
    token: env('BOBCAT_DISCORD_BOT_TOKEN'),
    guildId: env('BOBCAT_GUILD_ID'),
  },
  roles: {
    // Grades
    direction: env('BOBCAT_DIRECTION_ROLE_ID'),
    coAtm: env('BOBCAT_CO_ATM_ROLE_ID'),
    employees: env('BOBCAT_EMPLOYEES_ROLE_ID'),
    // Spécialisations
    unite2Roues: env('BOBCAT_UNITE_2_ROUES_ROLE_ID'),
    uniteK9: env('BOBCAT_UNITE_K9_ROLE_ID'),
    recruteur: env('BOBCAT_RECRUTEUR_ROLE_ID'),
    formateur: env('BOBCAT_FORMATEUR_ROLE_ID'),
    // Habilitations
    fusilAPompe: env('BOBCAT_FUSIL_A_POMPE_ROLE_ID'),
    fusilAntiEmeute: env('BOBCAT_FUSIL_ANTI_EMEUTE_ROLE_ID'),
  },
  channels: {
    sessionAtm: env('BOBCAT_SESSION_ATM_CHANNEL_ID'),
    coAtm: env('BOBCAT_COATM_CHANNEL_ID'),
    rechercheAtm: env('BOBCAT_RECHERCHE_ATM_CHANNEL_ID'),
    pdsAtm: env('BOBCAT_PDS_ATM_CHANNEL_ID'),
    pdsPatrouille: env('BOBCAT_PDS_PATROUILLE_CHANNEL_ID'),
    logs: env('BOBCAT_LOGS_CHANNEL_ID'),
  },
  mongo: {
    uri: env('MONGODB_URI'),
    dbName: env('MONGODB_FOLDER'),
  },
  cloudinary: {
    cloudName: env('CLOUDINARY_CLOUD_NAME'),
    apiKey: env('CLOUDINARY_API_KEY'),
    apiSecret: env('CLOUDINARY_API_SECRET'),
    folder: env('CLOUDINARY_FOLDER') || 'bobcat-test/atm',
  },
  timezone: env('TIMEZONE') || 'Europe/Paris',
  /** Nombre minimum de personnes sur le dispatch (CO-ATM compris) pour commencer une session ATM. */
  atmMinAgents: positiveInt(env('ATM_MIN_AGENTS'), 3),
};

/** Nom de la variable du .env correspondant à chaque clé obligatoire (pour les messages d'erreur). */
const ENV_NAMES = {
  'discord.token': 'BOBCAT_DISCORD_BOT_TOKEN',
  'channels.sessionAtm': 'BOBCAT_SESSION_ATM_CHANNEL_ID',
  'mongo.uri': 'MONGODB_URI',
};

/**
 * Vérifie que les variables d'environnement indispensables sont présentes.
 * @param {string[]} keys Chemins des clés à vérifier (ex: "discord.token").
 */
function assertConfig(keys) {
  const missing = keys.filter((key) => !key.split('.').reduce((obj, part) => obj?.[part], config));
  if (missing.length) {
    throw new Error(`Configuration manquante dans le fichier .env : ${missing.map((k) => ENV_NAMES[k] ?? k).join(', ')}`);
  }
}

module.exports = { config, assertConfig };
