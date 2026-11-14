const atm = require('./atm');
const superviseur = require('./superviseur');
const supprimerPds = require('./supprimerPds');

/** Commandes du bot : commandes slash et commande du menu contextuel des messages. */
module.exports = [atm, superviseur, supprimerPds];
