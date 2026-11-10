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

/** Date seule "JJ/MM/AAAA" dans le fuseau `timeZone`. */
const formatDate = (date, timeZone) => formatDateTime(date, timeZone).split(' ')[0];

/** Clé de jour "AAAA-MM-JJ" dans le fuseau `timeZone` (pour regrouper par journée). */
function dayKey(date, timeZone) {
  const [day, month, year] = formatDate(date, timeZone).split('/');
  return `${year}-${month}-${day}`;
}

/** Début (inclus) et fin (exclue) de la journée de `date` dans le fuseau `timeZone`. */
function getDayBounds(date, timeZone) {
  const [day, month, year] = formatDate(date, timeZone).split('/').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: parseDateTime(`${pad(day)}/${pad(month)}/${year} 00:00`, timeZone),
    end: parseDateTime(`${pad(next.getUTCDate())}/${pad(next.getUTCMonth() + 1)}/${next.getUTCFullYear()} 00:00`, timeZone),
  };
}

const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

/**
 * Aujourd'hui et les `count - 1` jours suivants, pour le menu des dates :
 * "Mardi 10/11/2026 (aujourd'hui)", "Mercredi 11/11/2026 (demain dans 3 heures)", "Jeudi 12/11/2026"…
 * @returns {{ value: string, label: string }[]} value au format "AAAA-MM-JJ".
 */
function getUpcomingDays(now, timeZone, count = 7) {
  const [day, month, year] = formatDate(now, timeZone).split('/').map(Number);
  const msUntilTomorrow = getDayBounds(now, timeZone).end.getTime() - now.getTime();
  const hours = Math.floor(msUntilTomorrow / 3_600_000);
  const tomorrowIn = hours >= 1 ? plural(hours, 'heure') : plural(Math.max(1, Math.ceil(msUntilTomorrow / 60_000)), 'minute');
  const pad = (n) => String(n).padStart(2, '0');

  return Array.from({ length: count }, (_, i) => {
    // Date calendaire (midi UTC) : pas de décalage de fuseau possible.
    const date = new Date(Date.UTC(year, month - 1, day + i, 12));
    const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(date);
    const dd = pad(date.getUTCDate());
    const mm = pad(date.getUTCMonth() + 1);
    const yyyy = date.getUTCFullYear();
    let label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dd}/${mm}/${yyyy}`;
    if (i === 0) label += " (aujourd'hui)";
    if (i === 1) label += ` (demain dans ${tomorrowIn})`;
    return { value: `${yyyy}-${mm}-${dd}`, label };
  });
}

/** Timestamp Unix (secondes) utilisé par les balises <t:...> de Discord. */
const toUnix = (date) => Math.floor(date.getTime() / 1000);

module.exports = { parseDateTime, formatDateTime, formatDate, dayKey, getDayBounds, getUpcomingDays, toUnix };
