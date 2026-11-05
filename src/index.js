const { ActivityType, Client, Events, GatewayIntentBits } = require('discord.js');
const { config, assertConfig } = require('./config');

assertConfig(['discord.token', 'atm.channelId', 'mongo.uri']);

const { connectDatabase, disconnectDatabase } = require('./database/mongoose');
const { handleInteraction } = require('./interactions');
const { deployCommands } = require('./commands/deploy');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Discord] Connecté en tant que ${readyClient.user.tag}.`);
  readyClient.user.setActivity('les ATM', { type: ActivityType.Watching });
  await deployCommands(readyClient);
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
    await connectDatabase(config.mongo.uri);
    await client.login(config.discord.token);
  } catch (error) {
    console.error('[Bot] Démarrage impossible :', error);
    process.exit(1);
  }
})();
