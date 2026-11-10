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

const replacementSchema = new Schema(
  {
    userId: { type: String, required: true },
    reason: { type: String, required: true },
    /** Membre ayant fait le remplacement. */
    by: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    reason: { type: String, required: true },
    /** Précision saisie pour la raison « Autre ». */
    details: { type: String, default: null },
    /** Membre ayant annulé (null : annulation automatique). */
    by: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const programReminderSchema = new Schema(
  {
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    sentAt: { type: Date, default: Date.now },
    /** Le CO-ATM a confirmé qu'il veut toujours faire la session. */
    confirmedAt: { type: Date, default: null },
  },
  { _id: false },
);

const startCheckSchema = new Schema(
  {
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    status: { type: String, enum: ['asked', 'maintained', 'closed'], default: 'asked' },
    maintainedAt: { type: Date, default: null },
    maintainedBy: { type: String, default: null },
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
    /** Session programmée : date à laquelle elle sera postée (1h45 avant son heure de début). */
    publishAt: { type: Date, default: null },
    /** Rappel envoyé au CO-ATM dans le salon CO-ATM avant la publication d'une session programmée. */
    programReminder: { type: programReminderSchema, default: null },
    /** Agents ayant cliqué sur « Je suis disponible ». */
    available: [{ type: String }],
    /** Agents sur dispatch : n°1 le CO-ATM (créateur), n°2 le superviseur (s'il y en a un), puis les agents. */
    dispatch: [dispatchAgentSchema],
    /** Date du dispatching (« Je suis disponible » est alors désactivé). */
    dispatchedAt: { type: Date, default: null },
    /** Agents choisis dans le 1er modal « Dispatching », en attente du choix du conducteur. */
    pendingDispatch: [{ type: String }],
    /** Remplacement en cours : agents à retirer du dispatch, avec la raison (avant le choix des remplaçants). */
    pendingReplacement: {
      type: new Schema({ agents: [replacementSchema] }, { _id: false }),
      default: null,
    },
    /** Historique des agents remplacés (retirés de la session). */
    replacements: [replacementSchema],

    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    cancellation: { type: cancellationSchema, default: null },
    /** Question « session maintenue ? » envoyée dans le salon CO-ATM 30 min après l'heure prévue. */
    startCheck: { type: startCheckSchema, default: null },
    /** Vérification du dispatching faite 30 min avant l'heure prévue (rappel au CO-ATM ou annulation). */
    dispatchCheckedAt: { type: Date, default: null },
    /** Rappel envoyé aux agents dispatchés 15 min avant l'heure prévue. */
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = model('Session-ATM', atmSessionSchema, 'Session-ATM');
