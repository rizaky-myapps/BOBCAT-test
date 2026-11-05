const { Schema, model } = require('mongoose');

/** Superviseurs proposés dans la question « Choix du superviseur » de /atm (gérés via /superviseur). */
const supervisorSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    /** Nom affiché au moment de l'ajout (libellé de secours dans le menu). */
    name: { type: String, default: '' },
    /** Date à laquelle le bot a constaté la perte du rôle CO ATM (null s'il l'a). */
    roleLostAt: { type: Date, default: null },
  },
  { timestamps: true },
);

supervisorSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Superviseur-List', supervisorSchema, 'Superviseur-List');
