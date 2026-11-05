const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * @param {string} uri URI MongoDB (MONGODB_URI)
 * @param {string|null} dbName Nom de la base (MONGODB_FOLDER)
 */
async function connectDatabase(uri, dbName) {
  await mongoose.connect(uri, dbName ? { dbName } : {});
  console.log(`[MongoDB] Connecté à la base "${mongoose.connection.name}".`);

  mongoose.connection.on('error', (error) => console.error('[MongoDB] Erreur :', error));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Déconnecté.'));
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
