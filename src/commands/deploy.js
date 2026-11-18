const { config } = require('../config');
const { commands, disabledCommands } = require('./index');
const { logAction } = require('../utils/logger');

/** Nom affiché dans les logs : /atm pour une commande slash, « Supprimer la PDS » pour le menu contextuel. */
const commandLabel = (command) => (command.type === 1 ? `/${command.name}` : `« ${command.name} »`);

/**
 * Enregistre (ou met à jour) les commandes activées dans config.json auprès de Discord.
 * Les commandes désactivées sont retirées de Discord.
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
    logAction(
      'Commandes',
      `${registered.size} commande(s) enregistrée(s) ${guildId ? `sur le serveur ${guildId}` : 'globalement'} : ${registered.map(commandLabel).join(', ')}`,
    );
    if (disabledCommands.length) {
      logAction(
        'Commandes',
        `Désactivée(s) dans config.json : ${disabledCommands.map((command) => commandLabel(command.data.toJSON())).join(', ')}`,
      );
    }
  } catch (error) {
    console.error(
      `[Commandes] Enregistrement impossible${guildId ? ` (le bot est-il bien sur le serveur ${guildId} ?)` : ''} :`,
      error,
    );
  }
}

module.exports = { deployCommands };
