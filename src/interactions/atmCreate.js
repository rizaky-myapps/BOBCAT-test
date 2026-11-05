const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { config } = require('../config');
const { VEHICLE_OTHER } = require('../atm/constants');
const { decodeDraft, encodeDraft, isValidDraft } = require('../atm/draft');
const { FIELDS, buildDetailsModal } = require('../atm/modals');
const { publishSession, resolveVehicle } = require('../atm/service');
const { parseDateTime } = require('../utils/date');

const hasField = (interaction, customId) => interaction.fields.fields.has(customId);

/** L'interaction provient-elle du message éphémère « compléter la session » (bouton ou modal ouvert depuis ce bouton) ? */
const fromMessage = (interaction) =>
  interaction.isMessageComponent() || (interaction.isModalSubmit() && interaction.isFromMessage());

/** Répond en éditant le message éphémère d'origine, ou par une nouvelle réponse éphémère. */
const respond = (interaction, payload) =>
  fromMessage(interaction)
    ? interaction.update(payload)
    : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });

/**
 * Étape commune : soit il manque des infos (véhicule « Autre », date invalide) et on
 * propose un bouton qui ouvre le 2e modal, soit on publie la session.
 */
async function processDraft(interaction, draft, otherVehicle) {
  const scheduledAt = parseDateTime(draft.rawDate, config.atm.timezone);
  const vehicle = resolveVehicle(draft.vehicle, otherVehicle);
  const needDate = !scheduledAt;
  const needVehicle = !vehicle;

  if (needDate || needVehicle) {
    const lines = [];
    if (needDate) {
      lines.push(
        `❌ La date \`${draft.rawDate || '(vide)'}\` est invalide.`,
        'Format attendu : `JJ/MM/AAAA HH:MM` (ex : `31/10/2026 21:00`).',
      );
    }
    if (needVehicle) {
      lines.push('🚙 Tu as choisi **Autre** comme véhicule : indique le véhicule utilisé pour la session.');
    }
    lines.push('', '👇 Clique sur le bouton ci-dessous pour compléter la session.');

    const button = new ButtonBuilder()
      .setCustomId(`atm:more:${encodeDraft(draft)}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(needVehicle ? '🚙' : '📅')
      .setLabel(needVehicle && needDate ? 'Compléter la session' : needVehicle ? 'Renseigner le véhicule' : 'Corriger la date');

    return respond(interaction, {
      content: lines.join('\n'),
      components: [new ActionRowBuilder().addComponents(button)],
    });
  }

  if (fromMessage(interaction)) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { message } = await publishSession(interaction, {
      scheduledAt,
      tenue: draft.tenue,
      radio: draft.radio,
      vehicle,
      ping: draft.ping,
    });
    await interaction.editReply({
      content: `✅ Session ATM publiée dans <#${message.channelId}> : ${message.url}\nUtilise le bouton ⚙️ du message pour gérer le dispatch.`,
      components: [],
    });
  } catch (error) {
    console.error('[ATM] Publication impossible :', error);
    await interaction.editReply({
      content: `❌ Impossible de publier la session : ${error.message}`,
      components: [],
    });
  }
}

/** Soumission du modal de /atm. */
async function handleCreateModal(interaction) {
  const { fields } = interaction;
  const draft = {
    rawDate: fields.getTextInputValue(FIELDS.date).trim(),
    tenue: fields.getStringSelectValues(FIELDS.tenue)[0],
    radio: fields.getStringSelectValues(FIELDS.radio)[0],
    vehicle: fields.getStringSelectValues(FIELDS.vehicle)[0],
    ping: fields.getStringSelectValues(FIELDS.ping)[0],
  };

  if (!isValidDraft(draft)) {
    return interaction.reply({ content: '❌ Réponses invalides, recommence avec `/atm`.', flags: MessageFlags.Ephemeral });
  }
  return processDraft(interaction, draft);
}

/** Bouton « Renseigner le véhicule » / « Corriger la date » : ouvre le 2e modal. */
async function handleMoreButton(interaction, args) {
  const draft = decodeDraft(args);
  if (!draft) {
    return interaction.reply({ content: '❌ Données expirées, recommence avec `/atm`.', flags: MessageFlags.Ephemeral });
  }

  const needDate = !parseDateTime(draft.rawDate, config.atm.timezone);
  const needVehicle = draft.vehicle === VEHICLE_OTHER;
  if (!needDate && !needVehicle) return processDraft(interaction, draft);

  return interaction.showModal(buildDetailsModal(draft, { needDate, needVehicle }));
}

/** Soumission du 2e modal (véhicule « Autre » et/ou date corrigée). */
async function handleMoreModal(interaction, args) {
  const draft = decodeDraft(args);
  if (!draft) {
    return interaction.reply({ content: '❌ Données expirées, recommence avec `/atm`.', flags: MessageFlags.Ephemeral });
  }

  if (hasField(interaction, FIELDS.date)) draft.rawDate = interaction.fields.getTextInputValue(FIELDS.date).trim();
  const otherVehicle = hasField(interaction, FIELDS.vehicleOther)
    ? interaction.fields.getTextInputValue(FIELDS.vehicleOther)
    : null;

  return processDraft(interaction, draft, otherVehicle);
}

module.exports = { handleCreateModal, handleMoreButton, handleMoreModal };
