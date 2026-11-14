const { config } = require('../config');

const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: config.timezone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Date et heure du journal : "14/11/2026 21:05:33". */
const stamp = () => formatter.format(new Date()).replace(',', '');

/**
 * Écrit une action dans la console du bot : "[14/11/2026 21:05:33] [Session] Session … publiée".
 * @param {string} scope Catégorie (Commande, Bouton, Session, BDD, Cloudinary…)
 * @param {string} message
 */
function logAction(scope, message) {
  console.log(`[${stamp()}] [${scope}] ${message}`);
}

/** Auteur d'une interaction : "Pseudo (id)". */
function who(interaction) {
  const name = interaction.member?.displayName ?? interaction.member?.nick ?? interaction.user?.globalName ?? interaction.user?.username;
  return `${name ?? 'inconnu'} (${interaction.user?.id})`;
}

/** Résumé court d'une valeur pour le journal. */
const short = (value, max = 80) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Contenu d'un modal soumis : "champ=valeur, champ=[a, b], photo=1 fichier(s)". */
function describeModalFields(interaction) {
  const parts = [];
  for (const [customId, field] of interaction.fields?.fields ?? []) {
    if (field.attachments) parts.push(`${customId}=${field.attachments.size} fichier(s)`);
    else if (field.values) parts.push(`${customId}=[${field.values.join(', ')}]`);
    else if (field.value !== undefined) parts.push(`${customId}="${short(field.value, 60)}"`);
  }
  return parts.join(', ');
}

/** Journalise une interaction d'un utilisateur (commande, menu contextuel, bouton, menu, modal). */
function logInteraction(interaction) {
  const author = who(interaction);
  const where = interaction.guild ? ` — serveur « ${interaction.guild.name} »` : '';
  if (interaction.isChatInputCommand?.()) return logAction('Commande', `/${interaction.commandName} par ${author}${where}`);
  if (interaction.isMessageContextMenuCommand?.()) {
    return logAction('Menu contextuel', `« ${interaction.commandName} » sur le message ${interaction.targetId} par ${author}${where}`);
  }
  if (interaction.isModalSubmit?.()) {
    return logAction('Formulaire', `${interaction.customId} envoyé par ${author} : ${describeModalFields(interaction) || '(vide)'}`);
  }
  if (interaction.isMessageComponent?.()) {
    const values = interaction.values ? ` = [${interaction.values.join(', ')}]` : '';
    return logAction(interaction.isButton?.() === false ? 'Menu' : 'Bouton', `${interaction.customId}${values} par ${author}`);
  }
}

module.exports = { logAction, logInteraction, who, short };
