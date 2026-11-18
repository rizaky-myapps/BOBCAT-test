const { LabelBuilder, ModalBuilder, StringSelectMenuBuilder } = require('discord.js');

/** Noms de patrouille : de MIKE à ZULU, sauf SIERRA et UNIFORM. */
const PATROL_NAMES = ['MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'TANGO', 'VICTOR', 'WHISKEY', 'X-RAY', 'YANKEE', 'ZULU'];

/** Identifiant du champ « Nom de la patrouille ». */
const NAME_FIELD = 'nom';

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Modal de /patrouille : nom de la patrouille, puis la ou les listes d'agents (une liste vide n'est pas affichée).
 * @param {ReturnType<import('./agents').getAgentLists>} lists
 */
function buildPatrolModal(lists) {
  const modal = new ModalBuilder()
    .setCustomId('patrouille:sub')
    .setTitle('Patrouille')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Nom de la patrouille :')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(NAME_FIELD)
            .setPlaceholder('Sélectionne le nom de la patrouille')
            .addOptions(PATROL_NAMES.map((name) => ({ label: name, value: name }))),
        ),
    );

  for (const list of lists.filter((item) => item.agents.length)) {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(list.label)
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(list.id)
            .setPlaceholder('Sélectionne les agents')
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(list.agents.length)
            .addOptions(list.agents.map((agent) => ({ label: truncate(agent.name, 100), value: agent.id }))),
        ),
    );
  }
  return modal;
}

module.exports = { PATROL_NAMES, NAME_FIELD, buildPatrolModal };
