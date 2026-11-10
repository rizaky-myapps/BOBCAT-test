const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
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

  const withSupervisor = needsSupervisor(guild, draft);
  const accepted = Boolean(getConfirmedSupervisorId(draft));
  const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
  const button = (action, style, emoji, label) =>
    new ButtonBuilder().setCustomId(`atm:${action}:${id}`).setStyle(style).setEmoji(emoji).setLabel(label);

  // La date et l'heure se choisissent en premier (elles déterminent les radios et véhicules disponibles).
  // Tant que le superviseur n'a pas répondu, les informations ne sont pas modifiables.
  const noDate = !draft.scheduledAt;
  const rows = [
    row(button('date', ButtonStyle.Secondary, '🕑', "Choisir la date et l'heure").setDisabled(locked)),
    row(button('info', ButtonStyle.Secondary, 'ℹ️', 'Informations générales').setDisabled(locked || noDate)),
  ];
  // Uniquement pour les membres sans le rôle CO ATM ; plus modifiable une fois la présence validée.
  if (withSupervisor) {
    rows.push(
      row(button('sup', ButtonStyle.Secondary, '🛡️', 'Sélectionner un superviseur').setDisabled(locked || accepted || noDate)),
    );
  }
  rows.push(
    row(
      button(
        'ping',
        draft.ping ? ButtonStyle.Success : ButtonStyle.Danger,
        draft.ping ? '🔔' : '🔕',
        `Ping les agents : ${draft.ping ? 'Oui' : 'Non'}`,
      ),
      button('send', ButtonStyle.Primary, '📨', 'Poster la session').setDisabled(!isDraftComplete(draft, guild)),
    ),
  );

  const actions = new ContainerBuilder().addActionRowComponents(rows);

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), main, actions, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { renderPreview, isDraftComplete, isRequestPending };
