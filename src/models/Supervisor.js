const { Schema, model } = require('mongoose');

/** Superviseurs proposés dans la question « Choix du superviseur » de /atm (gérés via /superviseur). */
const supervisorSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    /** Nom affiché au moment de l'ajout (libellé de secours dans le menu). */
    name: { type: String, default: '' },
  },
  { timestamps: true },
);

supervisorSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Supervisor', supervisorSchema);
