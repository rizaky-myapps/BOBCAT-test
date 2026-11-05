const { PING_CHOICES, RADIOS, TENUES, VEHICLES } = require('./constants');

/**
 * Brouillon de session encodé dans le custom_id du bouton / modal « compléments ».
 * Discord ne permet pas d'ouvrir un modal en réponse à un autre modal : on passe donc
 * par un bouton, et on transporte les réponses du 1er modal dans son custom_id
 * (sans état côté bot, ça survit donc aussi à un redémarrage).
 *
 * Format : <tenue>:<radio>:<vehicule>:<ping>:<date brute>
 * La date brute est placée en dernier car elle contient elle-même des ":".
 */
function encodeDraft({ tenue, radio, vehicle, ping, rawDate }) {
  return [tenue, radio, vehicle, ping, rawDate].join(':');
}

const isIn = (list, value) => list.some((item) => item.value === value);

/** Vérifie que les valeurs du brouillon font partie des choix proposés. */
const isValidDraft = ({ tenue, radio, vehicle, ping }) =>
  isIn(TENUES, tenue) && isIn(RADIOS, radio) && isIn(VEHICLES, vehicle) && isIn(PING_CHOICES, ping);

/**
 * @param {string[]} args Segments du custom_id après le préfixe.
 * @returns {{ tenue: string, radio: string, vehicle: string, ping: string, rawDate: string } | null}
 */
function decodeDraft(args) {
  const [tenue, radio, vehicle, ping, ...dateParts] = args;
  const draft = { tenue, radio, vehicle, ping, rawDate: dateParts.join(':') };
  return isValidDraft(draft) ? draft : null;
}

module.exports = { encodeDraft, decodeDraft, isValidDraft };
