const fs = require('node:fs');
const path = require('node:path');
const { logAction } = require('./logger');

/** Racine du projet (fichiers de configuration modifiables : config.json, emoji.txt). */
const ROOT = path.join(__dirname, '..', '..');

/**
 * Chemin d'un fichier de configuration local, non suivi par git (il n'est donc jamais écrasé par un
 * déploiement). Au premier démarrage, il est créé à partir de son modèle (ex : emoji.example.txt).
 * @returns {{ file: string, example: string }} Chemins du fichier local et de son modèle.
 */
function ensureLocalFile(name, exampleName) {
  const file = path.join(ROOT, name);
  const example = path.join(ROOT, exampleName);
  if (!fs.existsSync(file)) {
    fs.copyFileSync(example, file);
    logAction('Config', `${name} absent : créé à partir de ${exampleName}`);
  }
  return { file, example };
}

module.exports = { ensureLocalFile };
