const { Schema, model } = require('mongoose');

/** PDS ATM : un distributeur rempli pendant une session (message dans BOBCAT_PDS_ATM_CHANNEL_ID). */
const pdsAtmSchema = new Schema(
  {
    guildId: { type: String, required: true },
    sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },

    /** Numéro de l'ATM dans la journée de la session (bouton « 03 »). */
    number: { type: Number, required: true },
    /** Journée de la session ("AAAA-MM-JJ") servant au numéro. */
    dayKey: { type: String, required: true },
    mallettes: { type: Number, required: true, min: 1 },
    /** Photo de l'emplacement de l'ATM, hébergée sur Cloudinary. */
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    /** Agents de la session au moment de la PDS, déjà formatés ("[22] • Yvick Waler"). */
    agents: [{ type: String }],
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

pdsAtmSchema.index({ guildId: 1, dayKey: 1, number: 1 }, { unique: true });

module.exports = model('PDS-ATM', pdsAtmSchema, 'PDS-ATM');
