const { Schema, model } = require('mongoose');

/** Véhicules de l'entreprise (gérés via /gestion → Véhicules). */
const vehicleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    /** Nom du véhicule (type), ex : « Buffalo ». Les véhicules sont regroupés par nom. */
    name: { type: String, required: true },
    /** Plaque d'immatriculation (majuscules, espaces simples). */
    plate: { type: String, required: true },
    /** Kilométrage du prochain entretien. */
    nextServiceKm: { type: Number, required: true },
    /** Tag (« atm » : utilisé seulement pour les sessions ATM, proposé dans /atm), null si aucun. */
    tag: { type: String, default: null },
  },
  { timestamps: true },
);

vehicleSchema.index({ guildId: 1, plate: 1 }, { unique: true });

module.exports = model('Vehicule-List', vehicleSchema, 'Vehicule-List');
