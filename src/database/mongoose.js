const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectDatabase(uri) {
  await mongoose.connect(uri);
  console.log(`[MongoDB] Connecté à la base "${mongoose.connection.name}".`);

  mongoose.connection.on('error', (error) => console.error('[MongoDB] Erreur :', error));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Déconnecté.'));
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
