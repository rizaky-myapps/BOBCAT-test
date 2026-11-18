const { Schema, model } = require('mongoose');

/** Texte envoyé tous les dimanches à 23:59:59 dans les salons des séparateurs (/gestion → Séparateurs). */
const separatorTextSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    text: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = model('Separateur-Texte', separatorTextSchema, 'Separateur-Texte');
