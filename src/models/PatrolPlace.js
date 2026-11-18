const { Schema, model } = require('mongoose');

/** Lieux de patrouille (gérés via /gestion → Lieux de patrouille). */
const patrolPlaceSchema = new Schema(
  {
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    /** Nom en minuscules : deux lieux ne peuvent pas avoir le même nom. */
    nameKey: { type: String, required: true },
  },
  { timestamps: true },
);

patrolPlaceSchema.index({ guildId: 1, nameKey: 1 }, { unique: true });

module.exports = model('Lieu-Patrouille-List', patrolPlaceSchema, 'Lieu-Patrouille-List');
