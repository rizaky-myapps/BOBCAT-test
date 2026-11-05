const commands = require('../commands');
const preview = require('./atmPreview');
const { handleAvailableButton, handleManageButton } = require('./atmSession');
const { handleSupervisorModal } = require('./supervisor');
const panel = require('./atmPanel');
const { ephemeralText } = require('../utils/v2');

/**
 * Routage des composants / modals par préfixe de custom_id ("<namespace>:<action>:<arguments...>").
 */
const componentHandlers = {
  // Aperçu de /atm
  'atm:info': preview.handleInfoButton,
  'atm:infosub': preview.handleInfoModal,
  'atm:plate': preview.handlePlateButton,
  'atm:platesub': preview.handlePlateModal,
  'atm:ping': preview.handlePingButton,
  'atm:send': preview.handleSendButton,
  // Message public de la session
  'atm:dispo': handleAvailableButton,
  'atm:manage': handleManageButton,
  // /superviseur
  'sup:save': handleSupervisorModal,
  // Panneau de gestion (plus accessible : le bouton ⚙️ affiche « En développement »)
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

    const payload = ephemeralText('❌ Une erreur est survenue, réessaie plus tard.');
    const reply = interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
    await reply.catch(() => null);
  }
}

module.exports = { handleInteraction };
