const { REST, Routes } = require('discord.js');
const { config, assertConfig } = require('./config');
const commands = require('./commands');

assertConfig(['discord.token', 'discord.clientId']);

const { token, clientId, guildId } = config.discord;
const body = commands.map((command) => command.data.toJSON());
const rest = new REST().setToken(token);

(async () => {
  try {
    const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
    const data = await rest.put(route, { body });
    console.log(
      `[Deploy] ${data.length} commande(s) enregistrée(s) ${guildId ? `sur le serveur ${guildId}` : 'globalement'}.`,
    );
  } catch (error) {
    console.error('[Deploy] Échec :', error);
    process.exit(1);
  }
})();
