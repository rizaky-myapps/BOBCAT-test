const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const PdsAtm = require('../models/PdsAtm');
const { config } = require('../config');
const { STATUSES, findLabel } = require('./constants');
const { dayKey, toUnix } = require('../utils/date');
const { separator } = require('../utils/v2');

const button = (customId, style, emoji, label) =>
  new ButtonBuilder().setCustomId(customId).setStyle(style).setEmoji(emoji).setLabel(label);
const labelButton = (customId, style, label) => new ButtonBuilder().setCustomId(customId).setStyle(style).setLabel(label);
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);

/**
 * Panneau de gestion (éphémère) ouvert par le bouton ⚙️ d'une session postée.
 * - En attente : 🛑 (annuler), Modifier les informations, Gestion du Dispatch, Commencer la session
 * - En cours : 🛑 (terminer), Nouvelle PDS
 * @param {import('../models/AtmSession')} session
 * @param {string} [notice] Message affiché sous le résumé (retour d'une action).
 */
async function renderSessionPanel(session, notice) {
  const id = session._id.toString();
  const ts = toUnix(session.scheduledAt);
  const inProgress = session.status === 'in_progress';

  // ATM remplis le jour de la session (même compteur que le numéro des PDS) et sur la session.
  const [today, onSession] = await Promise.all([
    PdsAtm.countDocuments({ guildId: session.guildId, dayKey: dayKey(session.scheduledAt, config.timezone) }),
    inProgress ? PdsAtm.countDocuments({ sessionId: session._id }) : 0,
  ]);

  const lines = [
    `> **Date :** <t:${ts}:d> à <t:${ts}:t> (<t:${ts}:R>)`,
    `> **Statut :** \`${findLabel(STATUSES, session.status)}\``,
    `> **Nombre d'ATM remplis aujourd'hui :** \`${today}\``,
  ];
  if (inProgress) lines.push(`> **Nombre d'ATM remplis sur la session :** \`${onSession}\``);
  if (notice) lines.push('', notice);

  // 🛑 : annule la session avant son début, la termine pendant (avec double vérification).
  const close = new ButtonBuilder()
    .setCustomId(inProgress ? `atm:pfinish:${id}` : `atm:pcancel:${id}:panel`)
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🛑');

  const container = new ContainerBuilder().addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
      .setButtonAccessory(close),
  );

  if (inProgress) {
    container.addActionRowComponents(row(button(`atm:ppds:${id}`, ButtonStyle.Secondary, '🏧', 'Nouvelle PDS')));
  } else {
    container.addActionRowComponents(
      row(
        labelButton(`atm:pinfo:${id}`, ButtonStyle.Secondary, 'Modifier les informations'),
        labelButton(`atm:pdispatch:${id}`, ButtonStyle.Secondary, 'Gestion du Dispatch'),
      ),
    );
    // Dispatching en plusieurs étapes : Discord ne permet pas d'enchaîner deux modals.
    if (session.pendingDispatch?.length) {
      container.addActionRowComponents(
        row(button(`atm:pdriver:${id}`, ButtonStyle.Primary, '🚙', 'Choisir le conducteur')),
      );
    } else if (session.pendingReplacement) {
      container.addActionRowComponents(
        row(button(`atm:preplace:${id}`, ButtonStyle.Primary, '👥', 'Choisir les remplaçants')),
      );
    }
    container.addActionRowComponents(row(labelButton(`atm:pstart:${id}`, ButtonStyle.Success, 'Commencer la session')));
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { parse: [] },
  };
}

const CONFIRMS = {
  cancel: (id, source) => ({
    text: "## ⚠️ Annuler la session ATM ?\nTu devras ensuite indiquer la raison de l'annulation. Cette action est définitive.",
    button: button(`atm:pcancelok:${id}:${source}`, ButtonStyle.Danger, '🛑', 'Oui, annuler la session'),
  }),
  finish: (id) => ({
    text: '## ⚠️ Terminer la session ATM ?\nTous les boutons de la session et de ses PDS seront désactivés. Cette action est définitive.',
    button: button(`atm:pfinishok:${id}`, ButtonStyle.Danger, '🏁', 'Oui, terminer la session'),
  }),
  start: (id, source, session) => ({
    text: [
      '## ⚠️ Commencer la session ATM ?',
      'Les agents présents sur le dispatch sont-ils **tous autour de la table** ?',
      ...session.dispatch.map((agent) => `> - <@${agent.userId}>`),
    ].join('\n'),
    button: button(`atm:pstartok:${id}`, ButtonStyle.Success, '✅', 'Oui, ils sont tous là'),
  }),
};

/**
 * Double vérification avant d'annuler, de terminer ou de commencer une session.
 * @param {'cancel'|'finish'|'start'} action
 * @param {string} [source] "panel" (panneau ⚙️) ou "check" (question du salon CO-ATM)
 */
function renderConfirm(session, action, source = 'panel') {
  const id = session._id.toString();
  const { text, button: confirm } = CONFIRMS[action](id, source, session);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(confirm, button(`atm:pback:${id}:${source}`, ButtonStyle.Secondary, '↩️', 'Retour')),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [separator(), container, separator()],
    allowedMentions: { parse: [] },
  };
}

module.exports = { renderSessionPanel, renderConfirm };
