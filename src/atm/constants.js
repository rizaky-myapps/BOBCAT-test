/**
 * Valeurs proposées dans les menus de sélection du modal /atm.
 * `value` est stocké en base, `label` est affiché dans Discord.
 */
const TENUES = [
  { value: 'long', label: 'CDF/ATM Long' },
  { value: 'court', label: 'CDF/ATM Court' },
];

const RADIOS = [
  { value: 's6', label: 'Sierra 6', short: 'S6' },
  { value: 's7', label: 'Sierra 7', short: 'S7' },
  { value: 's8', label: 'Sierra 8', short: 'S8' },
];

const VEHICLE_OTHER = 'autre';

const VEHICLES = [
  { value: 'zjr325', label: 'ZJR 325' },
  { value: 'abc123', label: 'ABC 123' },
  { value: VEHICLE_OTHER, label: 'Autre' },
];

/** Statuts d'une session (affichés dans « Informations »). */
const STATUSES = [
  { value: 'pending', label: 'En attente...', emoji: '⏳' },
  { value: 'in_progress', label: 'En cours', emoji: '🚨' },
  { value: 'done', label: 'Terminée', emoji: '✅' },
  { value: 'cancelled', label: 'Annulée', emoji: '❌' },
];

/** Statuts pour lesquels on ne peut plus se déclarer disponible. */
const CLOSED_STATUSES = ['done', 'cancelled'];

/**
 * Rôles attribuables aux agents sur dispatch (cf. « Légende » du message).
 * L'ordre ici est l'ordre d'affichage des emojis à côté de l'agent.
 */
const AGENT_ROLES = [
  { value: 'chef', emoji: '🛡️', label: "Chef d'opération de la mission" },
  { value: 'co_atm', emoji: '🧳', label: 'CO ATM (en cas du supervision)' },
  { value: 'pompe', emoji: '🔫', label: 'Fusil à pompe' },
  { value: 'conducteur', emoji: '🚙', label: 'Conducteur' },
  { value: 'nouveau', emoji: '🆕', label: "Besoin d'explication" },
];

/** Nombre de lignes affichées au minimum dans « Agents sur dispatch ». */
const DISPATCH_MIN_LINES = 4;

const MINUTE = 60 * 1000;
/** Délai de réponse du superviseur sollicité ; sans réponse, la demande est considérée comme refusée. */
const SUPERVISOR_RESPONSE_DELAY = 10 * MINUTE;
/** Fréquence de vérification des demandes de supervision sans réponse. */
const SUPERVISOR_CHECK_INTERVAL = 30 * 1000;
/** Durée de vie d'un brouillon non envoyé. */
const DRAFT_LIFETIME = 5 * 60 * MINUTE;
/** Fréquence de suppression des brouillons expirés. */
const DRAFT_CLEANUP_INTERVAL = 10 * MINUTE;

const findLabel = (list, value) => list.find((item) => item.value === value)?.label ?? value;

module.exports = {
  TENUES,
  RADIOS,
  VEHICLES,
  VEHICLE_OTHER,
  STATUSES,
  CLOSED_STATUSES,
  AGENT_ROLES,
  DISPATCH_MIN_LINES,
  SUPERVISOR_RESPONSE_DELAY,
  SUPERVISOR_CHECK_INTERVAL,
  DRAFT_LIFETIME,
  DRAFT_CLEANUP_INTERVAL,
  findLabel,
};
