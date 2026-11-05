const {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
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

/** Nombre max d'agents listés dans « Agent(s) disponible(s) » (limite de 4000 caractères par message). */
const MAX_AVAILABLE_SHOWN = 60;

const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

function formatDispatchLines(dispatch) {
  const lines = dispatch.map((agent) => {
    const emojis = AGENT_ROLES.filter((role) => agent.roles.includes(role.value)).map((role) => role.emoji);
    return `> - <@${agent.userId}>${emojis.length ? ` ${emojis.join(' ')}` : ''}`;
  });
  while (lines.length < DISPATCH_MIN_LINES) lines.push('> - ...');
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

function buildMainText(session) {
  const ts = toUnix(session.scheduledAt);
  const radio = RADIOS.find((item) => item.value === session.radio)?.short ?? session.radio;
  const legend = AGENT_ROLES.map((role) => `> ${role.emoji}﻿ ${role.label}`).join('\n');

  return [
    '# SESSION ATM',
    `Recherche d'agent pour un ravitaillement d'ATM.${session.pingMention ? ` ${session.pingMention}` : ''}`,
    "Ceux présent sur le dispatch, rendez-vous à l'heure indiquée au QG.",
    '',
    `> **Date :** <t:${ts}:d>`,
    `> **Heure :** <t:${ts}:t> <t:${ts}:R>`,
    '',
    '- **__Agents sur dispatch :__**',
    formatDispatchLines(session.dispatch),
    '',
    '- **__Informations :__**',
    `> **Radio :** \`${radio}\``,
    `> **Tenue :** \`${findLabel(TENUES, session.tenue)}\``,
    `> **Véhicule :** \`${session.vehicle}\``,
    `> **Statut :** \`${findLabel(STATUSES, session.status)}\``,
    '',
    '- **__Légende :__**',
    legend,
  ].join('\n');
}

/**
 * Construit le message (Components V2) d'une session ATM.
 * @param {import('../models/AtmSession')} session
 * @returns {{ flags: number, components: import('discord.js').JSONEncodable<unknown>[] }}
 */
function renderSessionMessage(session) {
  const id = session._id.toString();
  const closed = CLOSED_STATUSES.includes(session.status);

  // --- Bloc principal + bouton ⚙️ (gestion) ---
  const mainContainer = new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildMainText(session)))
      .setButtonAccessory(
        new ButtonBuilder().setCustomId(`atm:manage:${id}`).setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
      ),
  );

  if (session.photos.length) {
    mainContainer
      .addSeparatorComponents(separator())
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          session.photos.map((photo) => new MediaGalleryItemBuilder().setURL(photo.url)),
        ),
      );
  }

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
    components: [separator(), mainContainer, availableContainer, separator()],
  };
}

module.exports = { renderSessionMessage };
