const { Schema, model } = require('mongoose');

/** Salons dans lesquels le bot doit envoyer un message tous les dimanches à 23:59:59 (/gestion → Séparateurs). */
const separatorChannelSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    /** Dernier séparateur envoyé par le bot dans ce salon (null si aucun). */
    lastMessageId: { type: String, default: null },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

separatorChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = model('Separateur-List', separatorChannelSchema, 'Separateur-List');
