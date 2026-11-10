const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * @param {string} uri URI MongoDB (MONGODB_URI)
 * @param {string|null} dbName Nom de la base (MONGODB_FOLDER)
 */
async function connectDatabase(uri, dbName) {
  await mongoose.connect(uri, dbName ? { dbName } : {});
  console.log(`[MongoDB] Connecté à la base "${mongoose.connection.name}".`);
  // Anciens noms des collections.
  await renameCollection('PDS-ATM', 'Session-ATM-PDS');
  await renameCollection('Sessions-ATM', 'Session-ATM');
  await renameCollection('Sessions-ATM-Draft', 'Session-ATM-Draft');

  mongoose.connection.on('error', (error) => console.error('[MongoDB] Erreur :', error));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Déconnecté.'));
}

/** Renomme une collection existante (une seule fois : si l'ancienne existe et pas la nouvelle). */
async function renameCollection(from, to) {
  const names = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  if (names.includes(from) && !names.includes(to)) {
    await mongoose.connection.db.renameCollection(from, to);
    console.log(`[MongoDB] Collection "${from}" renommée en "${to}".`);
  }
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
