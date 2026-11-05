const { MessageFlags } = require('discord.js');
const commands = require('../commands');
const { handleCreateModal, handleMoreButton, handleMoreModal } = require('./atmCreate');
const { handleAvailableButton, handleManageButton } = require('./atmSession');
const panel = require('./atmPanel');

/**
 * Routage des composants / modals par préfixe de custom_id ("atm:<action>:<arguments...>").
 */
const componentHandlers = {
  // Création (/atm)
  'atm:create': handleCreateModal,
  'atm:more': handleMoreButton,
  'atm:moresub': handleMoreModal,
  // Message public de la session
  'atm:dispo': handleAvailableButton,
  'atm:manage': handleManageButton,
  // Panneau de gestion ⚙️
  'atm:dispatch': panel.handleDispatchSelect,
  'atm:status': panel.handleStatusSelect,
  'atm:roles': panel.handleRolesButton,
  'atm:rolessub': panel.handleRolesModal,
  'atm:edit': panel.handleEditButton,
  'atm:editsub': panel.handleEditModal,
  'atm:photo': panel.handlePhotoButton,
  'atm:photosub': panel.handlePhotoModal,
  'atm:photoclear': panel.handlePhotoClearButton,
};

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    return command?.execute(interaction);
  }

  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    const [namespace, action, ...args] = interaction.customId.split(':');
    const handler = componentHandlers[`${namespace}:${action}`];
    return handler?.(interaction, args);
  }
}

/** @param {import('discord.js').Interaction} interaction */
async function handleInteraction(interaction) {
  try {
    await routeInteraction(interaction);
  } catch (error) {
    console.error(`[Interaction] Erreur (${interaction.customId ?? interaction.commandName}) :`, error);
    if (!interaction.isRepliable()) return;

    const payload = { content: '❌ Une erreur est survenue, réessaie plus tard.', flags: MessageFlags.Ephemeral };
    const reply = interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
    await reply.catch(() => null);
  }
}

module.exports = { handleInteraction };
