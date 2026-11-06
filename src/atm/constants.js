const { config } = require('../config');

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
  { value: 'in_progress', label: 'En cours...', emoji: '🚨' },
  { value: 'done', label: 'Terminée', emoji: '✅' },
  { value: 'cancelled', label: 'Annulée', emoji: '❌' },
];

/** Statuts d'une session terminée ou annulée : tous ses boutons sont désactivés. */
const CLOSED_STATUSES = ['done', 'cancelled'];

/** Couleur du liseré d'une session annulée. */
const CANCELLED_ACCENT_COLOR = 0xed4245;

const CANCEL_OTHER = 'autre';

/** Raisons proposées dans le modal « Annuler ». */
const CANCEL_REASONS = [
  { value: 'effectif', label: "Manque d'effectif" },
  { value: 'coatm', label: 'CO-ATM indisponible' },
  { value: 'superviseur', label: 'Superviseur indisponible' },
  { value: 'vehicule', label: 'Véhicule indisponible' },
  { value: CANCEL_OTHER, label: 'Autre' },
];

/** Raison enregistrée quand une session maintenue n'a pas commencé à temps. */
const CANCEL_NOT_STARTED = { value: 'non_commencee', label: 'Session non commencée à temps' };
/** Raison enregistrée quand une session est annulée faute d'agents disponibles. */
const CANCEL_NO_AGENTS = { value: 'manque_agents', label: "Manque d'agents" };

/** Places dans le véhicule (CO-ATM et superviseur compris) ; un agent de plus peut suivre en moto. */
const VEHICLE_CAPACITY = 4;

/** Nombre minimum de personnes sur le dispatch pour commencer (CO-ATM compris) : ATM_MIN_AGENTS du .env. */
const MIN_DISPATCH = config.atmMinAgents;

/**
 * Taille du carré des photos de PDS par rapport à la hauteur de la capture : assez petit pour exclure
 * le HUD de la carte (barre d'instructions en bas, légende à droite), centré sur la croix.
 */
const PDS_CROP_RATIO = 0.8;

/** Nombre de mallettes proposé dans le modal « Nouvelle PDS ». */
const MAX_MALLETTES = 5;

/**
 * Rôles attribuables aux agents sur dispatch (cf. « Légende » du message).
 * L'ordre ici est l'ordre d'affichage des emojis à côté de l'agent.
 */
const AGENT_ROLES = [
  { value: 'chef', emoji: '🛡️', label: "Chef d'opération de la mission" },
  { value: 'co_atm', emoji: '🧳', label: 'CO ATM (en cas du supervision)' },
  { value: 'pompe', emoji: '🔫', label: 'Fusil à pompe' },
  { value: 'conducteur', emoji: '🚙', label: 'Conducteur' },
  { value: 'moto', emoji: '🏍️', label: 'Motard (Unité 2 roues)' },
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
/** Délai avant de retirer de la liste un superviseur qui a perdu le rôle CO ATM. */
const SUPERVISOR_ROLE_GRACE = 60 * MINUTE;
/** Fréquence de vérification du rôle CO ATM des superviseurs. */
const SUPERVISOR_ROLE_CHECK_INTERVAL = MINUTE;
/** Délai après l'heure prévue avant de demander au CO-ATM si une session non commencée est maintenue. */
const START_CHECK_DELAY = 30 * MINUTE;
/** Délai pour commencer une session maintenue, sinon elle est annulée. */
const START_DEADLINE = 10 * MINUTE;
/** Fréquence de vérification des sessions non commencées. */
const SESSION_CHECK_INTERVAL = MINUTE;
/** Délai minimum entre la publication d'une session et son heure de début. */
const MIN_POST_DELAY = 10 * MINUTE;
/** Durée approximative d'une session : un membre ne peut pas être sur deux sessions qui se chevauchent. */
const SESSION_DURATION = 90 * MINUTE;
/** Délai avant l'heure prévue pour vérifier le dispatching (rappel au CO-ATM ou annulation faute d'agents). */
const DISPATCH_CHECK_BEFORE = 30 * MINUTE;
/** Délai avant l'heure prévue pour le rappel aux agents dispatchés. */
const DISPATCH_REMINDER_BEFORE = 15 * MINUTE;

const findLabel = (list, value) => list.find((item) => item.value === value)?.label ?? value;

module.exports = {
  TENUES,
  RADIOS,
  VEHICLES,
  VEHICLE_OTHER,
  STATUSES,
  CLOSED_STATUSES,
  CANCELLED_ACCENT_COLOR,
  CANCEL_OTHER,
  CANCEL_REASONS,
  CANCEL_NOT_STARTED,
  CANCEL_NO_AGENTS,
  VEHICLE_CAPACITY,
  MIN_DISPATCH,
  MAX_MALLETTES,
  PDS_CROP_RATIO,
  AGENT_ROLES,
  DISPATCH_MIN_LINES,
  SUPERVISOR_RESPONSE_DELAY,
  SUPERVISOR_CHECK_INTERVAL,
  DRAFT_LIFETIME,
  DRAFT_CLEANUP_INTERVAL,
  SUPERVISOR_ROLE_GRACE,
  SUPERVISOR_ROLE_CHECK_INTERVAL,
  START_CHECK_DELAY,
  START_DEADLINE,
  SESSION_CHECK_INTERVAL,
  SESSION_DURATION,
  MIN_POST_DELAY,
  DISPATCH_CHECK_BEFORE,
  DISPATCH_REMINDER_BEFORE,
  findLabel,
};
