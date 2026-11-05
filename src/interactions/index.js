const commands = require('../commands');
const { showPreview } = require('../commands/atm');
const preview = require('./atmPreview');
const panel = require('./atmPanel');
const { handlePdsEditButton, handlePdsEditModal } = require('./pds');
const { handleAvailableButton, handleManageButton } = require('./atmSession');
const { handleSupervisorAccept, handleSupervisorModal, handleSupervisorRefuse } = require('./supervisor');
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
  'atm:force': showPreview,
  // Message public de la session
  'atm:dispo': handleAvailableButton,
  'atm:manage': handleManageButton,
  // Panneau ⚙️ (CO-ATM de la session et direction)
  'atm:pcancel': panel.handleCancelButton,
  'atm:pcancelsub': panel.handleCancelModal,
  'atm:pdispatch': panel.handleDispatchButton,
  'atm:pdispatchsub': panel.handleDispatchModal,
  'atm:pdriver': panel.handleDriverButton,
  'atm:pdriversub': panel.handleDriverModal,
  'atm:pinfo': panel.handleInfoButton,
  'atm:pinfosub': panel.handleInfoModal,
  'atm:pstart': panel.handleStartButton,
  'atm:ppds': panel.handlePdsButton,
  'atm:ppdssub': panel.handlePdsModal,
  'atm:pfinish': panel.handleFinishButton,
  // Question « session maintenue ? » (salon CO-ATM)
  'atm:keep': panel.handleKeepButton,
  // PDS ATM
  'pds:edit': handlePdsEditButton,
  'pds:editsub': handlePdsEditModal,
  // /superviseur
  'sup:save': handleSupervisorModal,
  // Demande de supervision (salon CO-ATM)
  'sup:accept': handleSupervisorAccept,
  'sup:refuse': handleSupervisorRefuse,
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
