const { AGENT_LIST_IDS } = require('../patrouille/agents');
const { fetchPatrolChannel, renderPatrolMessage } = require('../patrouille/message');
const { NAME_FIELD, PATROL_NAMES } = require('../patrouille/modal');
const { ephemeralText } = require('../utils/v2');
const { logAction, who } = require('../utils/logger');
const EMOJI = require('../emoji');

/** Validation du modal /patrouille : message avec les agents sélectionnés dans le salon PDS patrouille. */
async function handlePatrolModal(interaction) {
  const { fields } = interaction;
  const [name] = fields.getStringSelectValues(NAME_FIELD);
  if (!PATROL_NAMES.includes(name)) return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Réponse invalide, réessaie.`));

  const agents = [...new Set(AGENT_LIST_IDS.filter((id) => fields.fields.has(id)).flatMap((id) => fields.getStringSelectValues(id)))];

  let message;
  try {
    const channel = await fetchPatrolChannel(interaction.client);
    message = await channel.send(renderPatrolMessage(interaction.guild, name, interaction.user.id, agents));
  } catch (error) {
    console.error('[Patrouille] Envoi impossible :', error);
    return interaction.reply(ephemeralText(`${EMOJI.ERREUR} Impossible d'envoyer la patrouille : ${error.message}.`));
  }
  logAction('Patrouille', `${who(interaction)} : patrouille ${name} avec ${agents.length} agent(s) : ${message.url}`);
  return interaction.reply(ephemeralText(`${EMOJI.SUCCES} Patrouille **${name}** envoyée dans <#${message.channelId}> : ${message.url}`));
}

module.exports = { handlePatrolModal };
