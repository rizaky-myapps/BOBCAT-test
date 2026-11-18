const { AGENT_LIST_IDS } = require('../patrouille/agents');
const { NAME_FIELD, PATROL_NAMES } = require('../patrouille/modal');
const { ephemeralText } = require('../utils/v2');
const { logAction, who } = require('../utils/logger');
const EMOJI = require('../emoji');

/** Validation du modal /patrouille : récapitulatif des choix (la suite de la commande est en développement). */
async function handlePatrolModal(interaction) {
  const { fields } = interaction;
  const [name] = fields.getStringSelectValues(NAME_FIELD);
  if (!PATROL_NAMES.includes(name)) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Réponse invalide, réessaie.`));

  const agents = AGENT_LIST_IDS.filter((id) => fields.fields.has(id)).flatMap((id) => fields.getStringSelectValues(id));
  logAction('Patrouille', `${who(interaction)} : patrouille ${name} avec ${agents.length} agent(s)`);
  return interaction.reply(
    ephemeralText(
      `${EMOJI.INFO} Patrouille **${name}** : ${agents.length ? agents.map((id) => `<@${id}>`).join(', ') : 'aucun agent sélectionné'}.\nLa suite de la commande \`/patrouille\` est en développement.`,
    ),
  );
}

module.exports = { handlePatrolModal };
