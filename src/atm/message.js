const {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const {
  AGENT_ROLES,
  CLOSED_STATUSES,
  DISPATCH_MIN_LINES,
  RADIOS,
  STATUSES,
  TENUES,
  findLabel,
} = require('./constants');
const { toUnix } = require('../utils/date');
const { separator } = require('../utils/v2');

/** Nombre max d'agents listés dans « Agent(s) disponible(s) » (limite de 4000 caractères par message). */
const MAX_AVAILABLE_SHOWN = 60;
/** Valeur affichée tant qu'une information n'est pas renseignée (aperçu). */
const EMPTY = '...';

function formatDispatchLines(dispatch) {
  const lines = dispatch.map((agent) => {
    const emojis = AGENT_ROLES.filter((role) => agent.roles.includes(role.value)).map((role) => role.emoji);
    return `> - <@${agent.userId}>${emojis.length ? ` ${emojis.join(' ')}` : ''}`;
  });
  while (lines.length < DISPATCH_MIN_LINES) lines.push(`> - ${EMPTY}`);
  return lines.join('\n');
}

function formatAvailableLines(available) {
  if (!available.length) return '> *Aucun agent disponible pour le moment.*';
  const lines = available.slice(0, MAX_AVAILABLE_SHOWN).map((userId) => `> - <@${userId}>`);
  if (available.length > MAX_AVAILABLE_SHOWN) {
    lines.push(`> - *… et ${available.length - MAX_AVAILABLE_SHOWN} autre(s)*`);
  }
  return lines.join('\n');
}

/**
 * Texte principal de la session.
 * @param {{ scheduledAt?: Date|null, radio?: string|null, tenue?: string|null, vehicle?: string|null,
 *   pingMention?: string|null, status: string, dispatch: object[] }} data
 */
function buildMainText(data) {
  const ts = data.scheduledAt ? toUnix(data.scheduledAt) : null;
  const code = (value) => `\`${value || EMPTY}\``;
  const radio = data.radio ? (RADIOS.find((item) => item.value === data.radio)?.short ?? data.radio) : null;
  const tenue = data.tenue ? findLabel(TENUES, data.tenue) : null;
  const legend = AGENT_ROLES.map((role) => `> ${role.emoji}﻿ ${role.label}`).join('\n');

  return [
    '# SESSION ATM',
    `Recherche d'agent pour un ravitaillement d'ATM.${data.pingMention ? ` ${data.pingMention}` : ''}`,
    "Ceux présent sur le dispatch, rendez-vous à l'heure indiquée au QG.",
    '',
    `> **Date :** ${ts ? `<t:${ts}:d>` : EMPTY}`,
    `> **Heure :** ${ts ? `<t:${ts}:t> <t:${ts}:R>` : EMPTY}`,
    '',
    '- **__Agents sur dispatch :__**',
    formatDispatchLines(data.dispatch),
    '',
    '- **__Informations :__**',
    `> **Radio :** ${code(radio)}`,
    `> **Tenue :** ${code(tenue)}`,
    `> **Véhicule :** ${code(data.vehicle)}`,
    `> **Statut :** ${code(findLabel(STATUSES, data.status))}`,
    '',
    '- **__Légende :__**',
    legend,
  ].join('\n');
}

/**
 * Container principal (texte + bouton ⚙️ en haut à droite), partagé par le message et l'aperçu.
 * @param {Parameters<typeof buildMainText>[0]} data
 * @param {{ manageCustomId: string, manageDisabled?: boolean }} manage custom_id et état du bouton ⚙️
 */
function buildMainContainer(data, { manageCustomId, manageDisabled = false }) {
  return new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildMainText(data)))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(manageCustomId)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️')
          .setDisabled(manageDisabled),
      ),
  );
}

/**
 * Mentions autorisées : les personnes affichées dans le message (dispatch, disponibles)
 * et le rôle / @everyone du ping s'il est activé.
 */
function buildAllowedMentions(session) {
  const users = [
    ...new Set(
      [
        ...session.dispatch.map((agent) => agent.userId),
        ...session.available.slice(0, MAX_AVAILABLE_SHOWN),
      ].filter(Boolean),
    ),
  ].slice(0, 100);
  const roleId = /^<@&(\d+)>$/.exec(session.pingMention ?? '')?.[1];

  return {
    users,
    roles: roleId ? [roleId] : [],
    parse: session.pingMention === '@everyone' ? ['everyone'] : [],
  };
}

/**
 * Construit le message (Components V2) d'une session ATM publiée.
 * @param {import('../models/AtmSession')} session
 */
function renderSessionMessage(session) {
  const id = session._id.toString();
  const closed = CLOSED_STATUSES.includes(session.status);

  // --- Bloc « Agent(s) disponible(s) » + bouton « Je suis disponible » ---
  const availableContainer = new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## - Agent(s) disponible(s) :\n${formatAvailableLines(session.available)}`,
        ),
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`atm:dispo:${id}`)
          .setStyle(closed ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setLabel(closed ? `Session ${findLabel(STATUSES, session.status).toLowerCase()}` : 'Je suis disponible')
          .setDisabled(closed),
      ),
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), buildMainContainer(session, { manageCustomId: `atm:manage:${id}` }), availableContainer, separator()],
    allowedMentions: buildAllowedMentions(session),
  };
}

module.exports = { buildMainContainer, renderSessionMessage };
