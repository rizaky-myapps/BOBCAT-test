const { config } = require('../config');

/** Matricule du pseudo de serveur des employés, ex : « [22] • Yvick Waler » → 22 (null si absent). */
function getMatricule(member) {
  const match = /^\s*\[(\d{1,2})\]/.exec(member.displayName ?? '');
  return match ? Number(match[1]) : null;
}

/** 1re liste : matricules 02 à 25, et 69 à la place du 01. */
const isFirstRange = (matricule) => matricule === 69 || (matricule >= 2 && matricule <= 25);
/** 2e liste : matricules 26 à 50. */
const isSecondRange = (matricule) => matricule >= 26 && matricule <= 50;

/** Ordre des listes : le 69 en premier (à la place du 01), puis par matricule. */
const rank = (matricule) => (matricule === 69 ? 1 : matricule);

/** Un menu Discord est limité à 25 choix. */
const MAX_OPTIONS = 25;

/**
 * Listes d'agents du modal /patrouille : employés (rôle employés) ayant un matricule de 02 à 50 ou 69
 * dans leur pseudo de serveur, sauf l'émetteur de la commande. Une seule liste s'il y a moins de
 * 25 membres ayant le rôle employés, sinon deux (02 à 25 + 69, puis 26 à 50).
 * @param {import('discord.js').Guild} guild
 * @param {string} issuerId Émetteur de la commande (absent des listes)
 * @returns {{ id: string, label: string, agents: { id: string, name: string, matricule: number }[] }[]}
 */
function getAgentLists(guild, issuerId) {
  const employees = guild.members.cache.filter((member) => member.roles.cache.has(config.roles.employees));
  const agents = employees
    .filter((member) => member.id !== issuerId)
    .map((member) => ({ id: member.id, name: member.displayName, matricule: getMatricule(member) }))
    .filter((agent) => agent.matricule !== null && (isFirstRange(agent.matricule) || isSecondRange(agent.matricule)))
    .sort((a, b) => rank(a.matricule) - rank(b.matricule) || a.name.localeCompare(b.name));

  const lists =
    employees.size < 25
      ? [{ id: 'agents', label: 'Liste des agents', agents }]
      : [
          { id: 'agents_02_25', label: 'Liste des agents du matricule 02 à 25', agents: agents.filter((a) => isFirstRange(a.matricule)) },
          { id: 'agents_26_50', label: 'Liste des agents du matricule 26 à 50', agents: agents.filter((a) => isSecondRange(a.matricule)) },
        ];
  return lists.map((list) => ({ ...list, agents: list.agents.slice(0, MAX_OPTIONS) }));
}

/** Identifiants possibles des listes d'agents dans le modal. */
const AGENT_LIST_IDS = ['agents', 'agents_02_25', 'agents_26_50'];

module.exports = { getMatricule, getAgentLists, AGENT_LIST_IDS };
