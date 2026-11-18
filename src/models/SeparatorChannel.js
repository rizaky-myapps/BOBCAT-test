const { Schema, model } = require('mongoose');

/** Salons dans lesquels le bot doit envoyer un message tous les dimanches à 23:59:59 (/gestion → Séparateurs). */
const separatorChannelSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
  },
  { timestamps: true },
);

separatorChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = model('Separateur-List', separatorChannelSchema, 'Separateur-List');
