const fs = require('node:fs');
const path = require('node:path');
const atm = require('./atm');
const superviseur = require('./superviseur');
const supprimerPds = require('./supprimerPds');
const patrouille = require('./patrouille');

/** Commandes du bot : commandes slash et commande du menu contextuel des messages. */
const ALL_COMMANDS = [atm, superviseur, supprimerPds, patrouille];

/** Fichier de configuration (à la racine du projet) : « commands » → nom de la commande : true / false. */
const FILE = path.join(__dirname, '..', '..', 'config.json');

/** Lit config.json : chaque commande doit y être activée (true) ou désactivée (false), sinon le bot ne démarre pas. */
function loadCommandSettings() {
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(FILE, 'utf8')).commands;
  } catch (error) {
    throw new Error(`Fichier config.json illisible (${FILE}) : ${error.message}`);
  }
  const invalid = ALL_COMMANDS.map((command) => command.data.name).filter((name) => typeof settings?.[name] !== 'boolean');
  if (invalid.length) {
    throw new Error(`config.json : indique true ou false dans « commands » pour : ${invalid.join(', ')}`);
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
