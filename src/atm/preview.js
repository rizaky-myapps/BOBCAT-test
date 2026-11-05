const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
const { VEHICLE_OTHER } = require('./constants');
const { buildMainContainer } = require('./message');
const {
  buildDispatch,
  getConfirmedSupervisorId,
  getPingMention,
  needsSupervisor,
  resolveVehicle,
} = require('./service');
const { separator } = require('../utils/v2');

/** Une demande de supervision attend-elle la réponse du superviseur ? */
const isRequestPending = (draft) => draft.supervisorRequest?.status === 'pending';

/**
 * Toutes les informations nécessaires à l'envoi sont-elles renseignées ?
 * Si le créateur n'a pas le rôle CO ATM, le superviseur doit avoir validé sa présence.
 */
function isDraftComplete(draft, guild) {
  const infoComplete = Boolean(
    draft.scheduledAt && draft.tenue && draft.radio && resolveVehicle(draft.vehicle, draft.plate),
  );
  return infoComplete && (!needsSupervisor(guild, draft) || Boolean(getConfirmedSupervisorId(draft)));
}

/**
 * Aperçu (éphémère) du message qui sera envoyé par /atm.
 * La liste des agents disponibles est remplacée par les boutons de configuration.
 * @param {import('../models/AtmDraft')} draft
 * @param {import('discord.js').Guild} guild Serveur (rôles du créateur et logos des agents)
 */
function renderPreview(draft, guild) {
  const id = draft._id.toString();
  const supervisorId = needsSupervisor(guild, draft) ? draft.supervisorId : null;
  const locked = isRequestPending(draft);

  const main = buildMainContainer(
    {
      scheduledAt: draft.scheduledAt,
      radio: draft.radio,
      tenue: draft.tenue,
      vehicle: draft.vehicle ? resolveVehicle(draft.vehicle, draft.plate) : null,
      pingMention: draft.ping ? getPingMention() : null,
      status: 'pending',
      dispatch: buildDispatch(guild, draft.userId, supervisorId),
    },
    { manageCustomId: 'atm:manage:preview', manageDisabled: true },
  );

  // Tant que le superviseur n'a pas répondu, les informations ne sont pas modifiables.
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`atm:info:${id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝')
      .setLabel('Informations')
      .setDisabled(locked),
  ];

  if (draft.vehicle === VEHICLE_OTHER) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`atm:plate:${id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚙')
        .setLabel('Choisir la plaque')
        .setDisabled(locked),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`atm:ping:${id}`)
      .setStyle(draft.ping ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(draft.ping ? '🔔' : '🔕')
      .setLabel(`Ping agents : ${draft.ping ? 'OUI' : 'NON'}`),
    new ButtonBuilder()
      .setCustomId(`atm:send:${id}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📨')
      .setLabel('Envoyer')
      .setDisabled(!isDraftComplete(draft, guild)),
  );

  const actions = new ContainerBuilder().addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), main, actions, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { renderPreview, isDraftComplete, isRequestPending };
