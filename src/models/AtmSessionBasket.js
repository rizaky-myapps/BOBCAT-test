const { model } = require('mongoose');
const AtmSession = require('./AtmSession');

/** Corbeille des sessions ATM : les sessions annulées ou terminées y sont déplacées. */
const basketSchema = AtmSession.schema.clone();
basketSchema.add({ movedAt: { type: Date, default: Date.now } });

module.exports = model('Session-ATM-Basket', basketSchema, 'Session-ATM-Basket');
