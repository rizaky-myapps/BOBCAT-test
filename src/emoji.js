const fs = require('node:fs');
const dotenv = require('dotenv');
const { ensureLocalFile } = require('./utils/localFile');
const { logAction } = require('./utils/logger');

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
  // Lieux de patrouille (« Quand s'y rendre ? »)
  'LIEU_DISPONIBLE',
  'LIEU_ENTREPRISE_OUVERTE',
  'LIEU_APPEL_CENTRALE',
  'BOUTON_MODIFIER_LIEU',
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
  'SESSION_COMMENCEE',
  'SESSION_TERMINEE',
  'SESSION_ANNULEE',
];

/** Lit un fichier au format .env. */
function parseFile(file) {
  try {
    return dotenv.parse(fs.readFileSync(file));
  } catch (error) {
    throw new Error(`Fichier des émojis illisible (${file}) : ${error.message}`);
  }
}

/**
 * Lit emoji.txt (format .env : CLE=émoji, à la racine du projet, non suivi par git).
 * Une clé absente ou vide prend la valeur par défaut de emoji.example.txt.
 */
function loadEmojis() {
  const { file, example } = ensureLocalFile('emoji.txt', 'emoji.example.txt');
  const values = parseFile(file);
  const defaults = parseFile(example);

  const fromDefaults = KEYS.filter((key) => !values[key]?.trim());
  const missing = fromDefaults.filter((key) => !defaults[key]?.trim());
  if (missing.length) throw new Error(`Émojis manquants dans emoji.txt : ${missing.join(', ')}`);
  if (fromDefaults.length) {
    logAction('Config', `emoji.txt : valeur par défaut (emoji.example.txt) utilisée pour ${fromDefaults.join(', ')}`);
  }
  return Object.freeze(Object.fromEntries(KEYS.map((key) => [key, (values[key]?.trim() || defaults[key]).trim()])));
}

module.exports = loadEmojis();
