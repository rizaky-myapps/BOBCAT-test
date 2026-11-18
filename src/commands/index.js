const fs = require('node:fs');
const { ensureLocalFile } = require('../utils/localFile');
const { logAction } = require('../utils/logger');
const atm = require('./atm');
const supprimerPds = require('./supprimerPds');
const patrouille = require('./patrouille');
const gestion = require('./gestion');

/** Commandes du bot : commandes slash et commande du menu contextuel des messages. */
const ALL_COMMANDS = [atm, supprimerPds, patrouille, gestion];

/** Section « commands » d'un fichier de configuration JSON. */
function readCommands(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).commands ?? {};
  } catch (error) {
    throw new Error(`Fichier de configuration illisible (${file}) : ${error.message}`);
  }
}

/**
 * Lit config.json (à la racine du projet, non suivi par git) : « commands » → nom de la commande : true / false.
 * Une commande absente prend la valeur par défaut de config.example.json ; une autre valeur que true / false
 * empêche le bot de démarrer.
 */
function loadCommandSettings() {
  const { file, example } = ensureLocalFile('config.json', 'config.example.json');
  const local = readCommands(file);
  const defaults = readCommands(example);
  const names = ALL_COMMANDS.map((command) => command.data.name);

  const fromDefaults = names.filter((name) => !(name in local));
  const settings = Object.fromEntries(names.map((name) => [name, name in local ? local[name] : defaults[name]]));
  const invalid = names.filter((name) => typeof settings[name] !== 'boolean');
  if (invalid.length) {
    throw new Error(`config.json : indique true ou false dans « commands » pour : ${invalid.join(', ')}`);
  }
  if (fromDefaults.length) {
    logAction('Config', `config.json : valeur par défaut (config.example.json) utilisée pour ${fromDefaults.join(', ')}`);
  }
  return settings;
}

const settings = loadCommandSettings();

module.exports = {
  /** Commandes activées : enregistrées auprès de Discord et traitées par le bot. */
  commands: ALL_COMMANDS.filter((command) => settings[command.data.name]),
  /** Commandes désactivées : retirées de Discord au démarrage. */
  disabledCommands: ALL_COMMANDS.filter((command) => !settings[command.data.name]),
};
