const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
const { VEHICLE_OTHER } = require('./constants');
const { buildMainContainer } = require('./message');
const { buildDispatch, getPingMention, resolveVehicle } = require('./service');
const { separator } = require('../utils/v2');

/** Toutes les informations nécessaires à l'envoi sont-elles renseignées ? */
function isDraftComplete(draft) {
  return Boolean(
    draft.scheduledAt && draft.tenue && draft.radio && draft.supervisorId && resolveVehicle(draft.vehicle, draft.plate),
  );
}

/**
 * Aperçu (éphémère) du message qui sera envoyé par /atm.
 * La liste des agents disponibles est remplacée par les boutons de configuration.
 * @param {import('../models/AtmDraft')} draft
 * @param {import('discord.js').Guild} guild Serveur (pour les logos des agents sur dispatch)
 */
function renderPreview(draft, guild) {
  const id = draft._id.toString();

  const main = buildMainContainer(
    {
      scheduledAt: draft.scheduledAt,
      radio: draft.radio,
      tenue: draft.tenue,
      vehicle: draft.vehicle ? resolveVehicle(draft.vehicle, draft.plate) : null,
      supervisorId: draft.supervisorId,
      pingMention: draft.ping ? getPingMention() : null,
      status: 'pending',
      dispatch: buildDispatch(guild, draft.userId, draft.supervisorId),
    },
    { manageCustomId: 'atm:manage:preview', manageDisabled: true },
  );

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`atm:info:${id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝')
      .setLabel('Informations'),
  ];

  if (draft.vehicle === VEHICLE_OTHER) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`atm:plate:${id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚙')
        .setLabel('Choisir la plaque'),
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
      .setDisabled(!isDraftComplete(draft)),
  );

  const actions = new ContainerBuilder().addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), main, actions, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { renderPreview, isDraftComplete };
