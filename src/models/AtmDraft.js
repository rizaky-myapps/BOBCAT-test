const { Schema, model } = require('mongoose');

/**
 * Brouillon d'une session ATM pendant l'aperçu de /atm (avant envoi).
 * Supprimé automatiquement par MongoDB 24h après sa création.
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
  supervisorId: { type: String, default: null },
  /** Ping des agents à l'envoi (bouton OUI/NON). */
  ping: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

module.exports = model('Sessions-ATM-Draft', atmDraftSchema, 'Sessions-ATM-Draft');
