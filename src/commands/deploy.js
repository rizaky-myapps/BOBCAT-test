const { config } = require('../config');
const commands = require('./index');

/**
 * Enregistre (ou met à jour) les commandes slash auprès de Discord.
 * Appelé automatiquement au démarrage du bot, une fois le client connecté.
 * - BOBCAT_GUILD_ID renseigné : commandes du serveur (disponibles immédiatement)
 * - sinon : commandes globales (propagation jusqu'à 1h)
 * @param {import('discord.js').Client<true>} client
 */
async function deployCommands(client) {
  const { guildId } = config.discord;
  const body = commands.map((command) => command.data.toJSON());

  try {
    const registered = await client.application.commands.set(body, guildId ?? undefined);
    console.log(
      `[Commandes] ${registered.size} commande(s) enregistrée(s) ${guildId ? `sur le serveur ${guildId}` : 'globalement'} : ${registered.map((c) => `/${c.name}`).join(', ')}`,
    );
  } catch (error) {
    console.error(
      `[Commandes] Enregistrement impossible${guildId ? ` (le bot est-il bien sur le serveur ${guildId} ?)` : ''} :`,
      error,
    );
  }
}

module.exports = { deployCommands };
