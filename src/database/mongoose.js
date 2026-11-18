const mongoose = require('mongoose');
const { addFallbackDnsServers, resilientLookup } = require('./dns');
const { logAction } = require('../utils/logger');

mongoose.set('strictQuery', true);

/** Délai entre deux tentatives de connexion au démarrage. */
const RETRY_DELAY = 10_000;

/** Erreur réseau (serveur injoignable, DNS…) : la connexion peut réussir plus tard. */
const isNetworkError = (error) =>
  /^Mongo(ose)?(ServerSelection|Network|NetworkTimeout)Error$/.test(error?.name ?? '') ||
  /buffering timed out/.test(error?.message ?? '') ||
  ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(error?.code);

/** La base est-elle joignable en ce moment ? */
const isDatabaseConnected = () => mongoose.connection.readyState === mongoose.STATES.connected;

/**
 * Connexion à MongoDB. Au démarrage, une erreur réseau est réessayée toutes les 10 secondes jusqu'à la
 * connexion. Ensuite, le driver se reconnecte tout seul si la connexion est perdue.
 * @param {string} uri URI MongoDB (MONGODB_URI)
 * @param {string|null} dbName Nom de la base (MONGODB_FOLDER)
 */
async function connectDatabase(uri, dbName) {
  addFallbackDnsServers();
  const options = { lookup: resilientLookup, ...(dbName ? { dbName } : {}) };

  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri, options);
      break;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      console.warn(`[MongoDB] Connexion impossible (tentative ${attempt}) : ${error.message}. Nouvel essai dans 10 secondes.`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
  logAction('MongoDB', `Connecté à la base « ${mongoose.connection.name} »`);
  // Anciens noms des collections.
  await renameCollection('PDS-ATM', 'Session-ATM-PDS');
  await renameCollection('Sessions-ATM', 'Session-ATM');
  await renameCollection('Sessions-ATM-Draft', 'Session-ATM-Draft');

  mongoose.connection.on('error', (error) => console.error('[MongoDB] Erreur :', error));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Connexion perdue : reconnexion automatique en cours…'));
  mongoose.connection.on('reconnected', () => logAction('MongoDB', 'Reconnecté à la base'));
}

/** Renomme une collection existante (une seule fois : si l'ancienne existe et pas la nouvelle). */
async function renameCollection(from, to) {
  const names = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  if (names.includes(from) && !names.includes(to)) {
    await mongoose.connection.db.renameCollection(from, to);
    logAction('BDD', `Collection « ${from} » renommée en « ${to} »`);
  }
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseConnected, isNetworkError };
