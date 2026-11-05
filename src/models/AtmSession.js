const { Schema, model } = require('mongoose');
const { STATUSES, AGENT_ROLES } = require('../atm/constants');

const dispatchAgentSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** Nom affiché au moment de la sélection (sert uniquement de libellé dans les modals). */
    name: { type: String, default: '' },
    roles: [{ type: String, enum: AGENT_ROLES.map((role) => role.value) }],
  },
  { _id: false },
);

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const atmSessionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    creatorId: { type: String, required: true },

    scheduledAt: { type: Date, required: true },
    tenue: { type: String, required: true },
    radio: { type: String, required: true },
    vehicle: { type: String, required: true },
    /** Mention utilisée à la publication ("@everyone", "<@&roleId>") ou null si pas de ping. */
    pingMention: { type: String, default: null },

    status: { type: String, enum: STATUSES.map((status) => status.value), default: 'pending' },
    /** Agents ayant cliqué sur « Je suis disponible ». */
    available: [{ type: String }],
    /** Agents retenus sur le dispatch par le gestionnaire de la session. */
    dispatch: [dispatchAgentSchema],
    /** Photos de la session hébergées sur Cloudinary. */
    photos: [photoSchema],
  },
  { timestamps: true },
);

module.exports = model('AtmSession', atmSessionSchema);
