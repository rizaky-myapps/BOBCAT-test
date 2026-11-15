const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

/** Fichier des émojis (format .env : CLE=émoji), à la racine du projet. */
const FILE = path.join(__dirname, '..', 'emoji.txt');

const KEYS = [
  // Statuts des sessions
  'STATUT_PROGRAMMEE',
  'STATUT_EN_ATTENTE',
  'STATUT_EN_COURS',
  'STATUT_TERMINEE',
  'STATUT_ANNULEE',
  // Logos du dispatch
  'CO_ATM',
  'SUPERVISEUR',
  'CONDUCTEUR',
  'U2R',
  'FUSIL_A_POMPE',
  'NOUVEAU',
  // Boutons de l'aperçu (/atm)
  'BOUTON_DATE',
  'BOUTON_INFORMATIONS',
  'BOUTON_SUPERVISEUR',
  'BOUTON_PING_OUI',
  'BOUTON_PING_NON',
  'BOUTON_POSTER',
  'BOUTON_NOUVELLE_SESSION',
  'BOUTON_DEPROGRAMMER',
  'BOUTON_TOUJOURS_LA_FAIRE',
  // Boutons de la supervision
  'BOUTON_SUPERVISION_OUI',
  'BOUTON_SUPERVISION_NON',
  // Boutons de la session
  'BOUTON_GESTION',
  'BOUTON_STOP',
  'BOUTON_NOUVELLE_PDS',
  'BOUTON_CONDUCTEUR',
  'BOUTON_REMPLACANTS',
  'BOUTON_OUI_ANNULER',
  'BOUTON_OUI_TERMINER',
  'BOUTON_OUI_COMMENCER',
  'BOUTON_RETOUR',
  // Boutons des PDS
  'BOUTON_MODIFIER_PDS',
  'BOUTON_SUPPRIMER_PDS',
  'BOUTON_ANNULER_SUPPRESSION',
  // Messages
  'ERREUR',
  'INTERDIT',
  'VERROUILLE',
  'INFO',
  'SUCCES',
  'ATTENTION',
  'ATTENTE',
  'EXPIRE',
  'RAPPEL',
  'DATE',
  'ENVOI',
  'SUPPRESSION',
  'RETOUR',
  'AGENTS',
  'REMPLACEMENT',
  'DISPATCH_A_FAIRE',
  'LISTE_SUPERVISEURS',
  'SESSION_COMMENCEE',
  'SESSION_TERMINEE',
  'SESSION_ANNULEE',
];

/** Lit emoji.txt : toutes les clés doivent être renseignées, sinon le bot ne démarre pas. */
function loadEmojis() {
  let values;
  try {
    values = dotenv.parse(fs.readFileSync(FILE));
  } catch (error) {
    throw new Error(`Fichier des émojis illisible (${FILE}) : ${error.message}`);
  }
  const missing = KEYS.filter((key) => !values[key]?.trim());
  if (missing.length) throw new Error(`Émojis manquants dans emoji.txt : ${missing.join(', ')}`);
  return Object.freeze(Object.fromEntries(KEYS.map((key) => [key, values[key].trim()])));
}

module.exports = loadEmojis();
