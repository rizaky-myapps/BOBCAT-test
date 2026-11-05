/**
 * Format attendu : JJ/MM/AAAA HH:MM (on accepte aussi 1 chiffre pour le jour,
 * le mois et l'heure, ainsi que "h" à la place de ":").
 */
const DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:hH](\d{2})$/;

/**
 * Décalage (en ms) entre l'heure locale du fuseau `timeZone` et l'UTC à l'instant `timestamp`.
 */
function getTimeZoneOffset(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(timestamp));

  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/**
 * Convertit "31/10/2026 21:00" (heure locale de `timeZone`) en Date.
 * @returns {Date|null} null si le format ou la date est invalide.
 */
function parseDateTime(input, timeZone) {
  const match = DATE_REGEX.exec(String(input ?? '').trim());
  if (!match) return null;

  const [day, month, year, hour, minute] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;

  // Vérifie que le jour existe dans le mois (ex : 31/02 est refusé).
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;

  // Conversion heure locale -> UTC (deux passes pour gérer les changements d'heure).
  let timestamp = naive - getTimeZoneOffset(naive, timeZone);
  const secondOffset = getTimeZoneOffset(timestamp, timeZone);
  timestamp = naive - secondOffset;

  return new Date(timestamp);
}

/**
 * Formate une Date en "JJ/MM/AAAA HH:MM" dans le fuseau `timeZone`.
 */
function formatDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Timestamp Unix (secondes) utilisé par les balises <t:...> de Discord. */
const toUnix = (date) => Math.floor(date.getTime() / 1000);

module.exports = { parseDateTime, formatDateTime, toUnix };
