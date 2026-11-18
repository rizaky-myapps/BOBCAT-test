const { Schema, model } = require('mongoose');

/** Lieux de patrouille (gérés via /gestion → Lieux de patrouille). */
const patrolPlaceSchema = new Schema(
  {
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    /** Nom en minuscules : deux lieux ne peuvent pas avoir le même nom. */
    nameKey: { type: String, required: true },
    /** Émoji du lieu. */
    emoji: { type: String, default: null },
    /** Temps maximum par semaine (du lundi 00:00 au dimanche 23:59:59), en minutes. */
    weeklyMaxMinutes: { type: Number, default: null },
    /** Quand s'y rendre : « toujours », « ouvert » (entreprise ouverte) ou « centrale » (sur appel centrale). */
    when: { type: String, default: null },
    /** Temps maximum par passage, en minutes (15 ou 30). */
    visitMaxMinutes: { type: Number, default: null },
  },
  { timestamps: true },
);

patrolPlaceSchema.index({ guildId: 1, nameKey: 1 }, { unique: true });

module.exports = model('Lieu-Patrouille-List', patrolPlaceSchema, 'Lieu-Patrouille-List');
