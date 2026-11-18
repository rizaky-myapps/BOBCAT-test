const { commands } = require('../commands');
const { showPreview } = require('../commands/atm');
const preview = require('./atmPreview');
const panel = require('./atmPanel');
const { handlePdsDeleteButton, handlePdsDeleteCancel, handlePdsEditButton, handlePdsEditModal } = require('./pds');
const { handleProgramConfirmButton, handleUnprogramButton } = require('./programmed');
const { handleAvailableButton, handleManageButton } = require('./atmSession');
const { handleSupervisorAccept, handleSupervisorModal, handleSupervisorRefuse } = require('./supervisor');
const { handlePatrolModal } = require('./patrouille');
const gestion = require('./gestion');
const { ephemeralText } = require('../utils/v2');
const { logInteraction } = require('../utils/logger');
const EMOJI = require('../emoji');

/**
 * Routage des composants / modals par préfixe de custom_id ("<namespace>:<action>:<arguments...>").
 */
const componentHandlers = {
  // Aperçu de /atm
  'atm:info': preview.handleInfoButton,
  'atm:infosub': preview.handleInfoModal,
  'atm:date': preview.handleDateButton,
  'atm:pickday': preview.handleDayPick,
  'atm:pickhour': preview.handleHourPick,
  'atm:pickmin': preview.handleMinutePick,
  'atm:pickback': preview.handlePickBack,
  'atm:sup': preview.handleSupervisorButton,
  'atm:supsub': preview.handleSupervisorModal,
  'atm:ping': preview.handlePingButton,
  'atm:send': preview.handleSendButton,
  'atm:sendok': preview.handleSendConfirm,
  'atm:force': showPreview,
  // Sessions programmées
  'atm:unprog': handleUnprogramButton,
  'atm:progok': handleProgramConfirmButton,
  // Message public de la session
  'atm:dispo': handleAvailableButton,
  'atm:manage': handleManageButton,
  // Panneau ⚙️ (CO-ATM de la session et direction)
  'atm:pcancel': panel.handleCancelButton,
  'atm:pcancelok': panel.handleCancelConfirm,
  'atm:pcancelsub': panel.handleCancelModal,
  'atm:pback': panel.handleBack,
  'atm:pdispatch': panel.handleDispatchButton,
  'atm:pdispatchsub': panel.handleDispatchModal,
  'atm:preplacesub': panel.handleReplaceModal,
  'atm:preplace': panel.handleReplacePickButton,
  'atm:preplacepicksub': panel.handleReplacePickModal,
  'atm:pdriver': panel.handleDriverButton,
  'atm:pdriversub': panel.handleDriverModal,
  'atm:pinfo': panel.handleInfoButton,
  'atm:pinfosub': panel.handleInfoModal,
  'atm:pstart': panel.handleStartButton,
  'atm:pstartok': panel.handleStartConfirm,
  'atm:ppds': panel.handlePdsButton,
  'atm:ppdssub': panel.handlePdsModal,
  'atm:pfinish': panel.handleFinishButton,
  'atm:pfinishok': panel.handleFinishConfirm,
  // Question « session maintenue ? » (salon CO-ATM)
  'atm:keep': panel.handleKeepButton,
  // PDS ATM
  'pds:edit': handlePdsEditButton,
  'pds:editsub': handlePdsEditModal,
  'pds:del': handlePdsDeleteButton,
  'pds:delno': handlePdsDeleteCancel,
  // /gestion → Superviseur ATM
  'sup:save': handleSupervisorModal,
  // Demande de supervision (salon CO-ATM)
  'sup:accept': handleSupervisorAccept,
  'sup:refuse': handleSupervisorRefuse,
  // /patrouille
  'patrouille:sub': handlePatrolModal,
  // /gestion
  'ges:lieux': gestion.handleMenuPlaces,
  'ges:vehicules': gestion.handleMenuVehicles,
  'ges:sup': gestion.handleMenuSupervisors,
  'ges:sep': gestion.handleMenuSeparators,
  'ges:upr': gestion.handleMenuUpr,
  'veh:page': gestion.handleVehiclePage,
  'veh:add': gestion.handleVehicleAddButton,
  'veh:addsub': gestion.handleVehicleAddModal,
  'veh:edit': gestion.handleVehicleEditButton,
  'veh:editsub': gestion.handleVehicleEditModal,
  'veh:del': gestion.handleVehicleDeleteButton,
  'veh:delsub': gestion.handleVehicleDeleteModal,
  'lieu:add': gestion.handlePlaceAddButton,
  'lieu:addsub': gestion.handlePlaceAddModal,
  'lieu:del': gestion.handlePlaceDeleteButton,
  'lieu:delsub': gestion.handlePlaceDeleteModal,
  'sep:add': gestion.handleSeparatorAddButton,
  'sep:addsub': gestion.handleSeparatorAddModal,
  'sep:del': gestion.handleSeparatorDeleteButton,
  'sep:delsub': gestion.handleSeparatorDeleteModal,
};

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
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
    logInteraction(interaction);
    await routeInteraction(interaction);
  } catch (error) {
    console.error(`[Interaction] Erreur (${interaction.customId ?? interaction.commandName}) :`, error);
    if (!interaction.isRepliable()) return;

    const payload = ephemeralText(`${EMOJI.ERREUR} Une erreur est survenue, réessaie plus tard.`);
    const reply = interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
    await reply.catch(() => null);
  }
}

module.exports = { handleInteraction };
