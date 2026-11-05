const { Client, Events, GatewayIntentBits } = require('discord.js');
const { config, assertConfig } = require('./config');

assertConfig(['discord.token', 'channels.sessionAtm', 'mongo.uri']);

const { connectDatabase, disconnectDatabase } = require('./database/mongoose');
const { handleInteraction } = require('./interactions');
const { deployCommands } = require('./commands/deploy');
const { startJobs } = require('./jobs');

// GuildMembers (intent privilégié) : nécessaire pour lister les membres ayant le rôle superviseur (/superviseur).
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

/** Met en cache les membres des serveurs (le cache reste ensuite à jour grâce à l'intent GuildMembers). */
async function cacheGuildMembers(readyClient) {
  for (const guild of readyClient.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      console.log(`[Discord] ${members.size} membre(s) chargé(s) pour « ${guild.name} ».`);
    } catch (error) {
      console.error(`[Discord] Impossible de charger les membres de « ${guild.name} » :`, error);
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Discord] Connecté en tant que ${readyClient.user.tag}.`);
  await deployCommands(readyClient);
  await cacheGuildMembers(readyClient);
  startJobs(readyClient);
});

client.on(Events.InteractionCreate, handleInteraction);

async function shutdown(signal) {
  console.log(`[Bot] ${signal} reçu, arrêt en cours…`);
  await client.destroy();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('[Bot] Promesse rejetée non gérée :', error));

(async () => {
  try {
    await connectDatabase(config.mongo.uri, config.mongo.dbName);
    await client.login(config.discord.token);
  } catch (error) {
    console.error('[Bot] Démarrage impossible :', error);
    process.exit(1);
  }
})();
