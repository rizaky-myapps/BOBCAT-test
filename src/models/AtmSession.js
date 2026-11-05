const { Schema, model } = require('mongoose');
const { STATUSES, AGENT_ROLES } = require('../atm/constants');

const dispatchAgentSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** Logos affichés à côté de l'agent (cf. « Légende » du message). */
    roles: [{ type: String, enum: AGENT_ROLES.map((role) => role.value) }],
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
    supervisorId: { type: String, default: null },
    /** Mention utilisée à la publication ("@everyone", "<@&roleId>") ou null si pas de ping. */
    pingMention: { type: String, default: null },

    status: { type: String, enum: STATUSES.map((status) => status.value), default: 'pending' },
    /** Agents ayant cliqué sur « Je suis disponible ». */
    available: [{ type: String }],
    /** Agents sur dispatch : n°1 le créateur, n°2 le superviseur (s'il y en a un), n°3 et n°4 définis plus tard. */
    dispatch: [dispatchAgentSchema],
  },
  { timestamps: true },
);

module.exports = model('Sessions-ATM', atmSessionSchema, 'Sessions-ATM');
