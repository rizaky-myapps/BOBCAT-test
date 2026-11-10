const { Schema, model } = require('mongoose');

/** Demande de supervision envoyée dans le salon CO-ATM. */
const supervisorRequestSchema = new Schema(
  {
    /** Identifiant de la demande (repris dans les boutons du message CO-ATM). */
    id: { type: String, required: true },
    supervisorId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'refused', 'expired'], default: 'pending' },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    /** Au-delà, sans réponse, la demande est considérée comme refusée. */
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Brouillon d'une session ATM pendant l'aperçu de /atm (avant envoi).
 * Supprimé 5h après sa création s'il n'a pas été envoyé (cf. src/jobs.js).
 */
const atmDraftSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },

  rawDate: { type: String, default: '' },
  scheduledAt: { type: Date, default: null },
  tenue: { type: String, default: null },
  radio: { type: String, default: null },
  vehicle: { type: String, default: null },
  /** Plaque saisie quand le véhicule « Autre » est choisi. */
  plate: { type: String, default: '' },
  /** Superviseur sélectionné (uniquement si le créateur n'a pas le rôle CO ATM). */
  supervisorId: { type: String, default: null },
  supervisorRequest: { type: supervisorRequestSchema, default: null },
  /** Ping des agents à l'envoi (bouton OUI/NON). */
  ping: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

module.exports = model('Session-ATM-Draft', atmDraftSchema, 'Session-ATM-Draft');
