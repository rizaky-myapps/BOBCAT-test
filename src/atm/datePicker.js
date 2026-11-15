const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { config } = require('../config');
const { formatDateTime, getUpcomingDays, parseDateTime } = require('../utils/date');
const EMOJI = require('../emoji');

/**
 * Choix de la date et de l'heure dans l'aperçu de /atm : liste Date, puis Heure, puis Minutes.
 * Seuls les horaires à venir sont proposés.
 */

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: `${pad(h)} h` }));
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ value: pad(i * 5), label: pad(i * 5) }));

/** Jour "AAAA-MM-JJ", heure et minutes (heure locale) → date brute "JJ/MM/AAAA HH:MM" et Date. */
function toSlot(day, hour, minute) {
  const [yyyy, mm, dd] = String(day).split('-');
  const rawDate = `${dd}/${mm}/${yyyy} ${hour}:${minute}`;
  return { rawDate, scheduledAt: parseDateTime(rawDate, config.timezone) };
}

const isFuture = (day, hour, minute, now) => {
  const { scheduledAt } = toSlot(day, hour, minute);
  return Boolean(scheduledAt) && scheduledAt.getTime() > now;
};

/** Aujourd'hui (s'il reste un horaire) et les 6 jours suivants. */
const getDayChoices = (now = Date.now()) =>
  getUpcomingDays(new Date(now), config.timezone).filter((day) => isFuture(day.value, '23', '55', now));

/** Heures du jour `day` ayant encore au moins un horaire à venir. */
const getHourChoices = (day, now = Date.now()) => HOURS.filter((hour) => isFuture(day, hour.value, '55', now));

/** Minutes (par 5) à venir pour le jour `day` à l'heure `hour`. */
const getMinuteChoices = (day, hour, now = Date.now()) =>
  HOURS.some((h) => h.value === hour) ? MINUTES.filter((minute) => isFuture(day, hour, minute.value, now)) : [];

/** L'horaire est-il proposé (dans les 7 jours et à venir) ? */
const isSlotAvailable = (day, hour, minute, now = Date.now()) =>
  getDayChoices(now).some((d) => d.value === day) && getMinuteChoices(day, hour, now).some((m) => m.value === minute);

/** Date et heure actuelles du brouillon, pré-sélectionnées dans les listes. */
function getPickerState(draft) {
  if (!draft.scheduledAt) return {};
  const [date, time] = formatDateTime(draft.scheduledAt, config.timezone).split(' ');
  const [dd, mm, yyyy] = date.split('/');
  const [hour, minute] = time.split(':');
  return { day: `${yyyy}-${mm}-${dd}`, hour, minute };
}

/**
 * Lignes de l'aperçu pendant le choix : Date, puis Heure (une fois la date choisie), puis Minutes
 * (une fois l'heure choisie), et « Retour ». Une valeur qui n'est plus proposée est ignorée.
 * @param {string} draftId
 * @param {{ day?: string, hour?: string, minute?: string }} state Choix déjà faits.
 */
function buildDatePickerRows(draftId, state = {}, now = Date.now()) {
  const days = getDayChoices(now);
  const day = days.some((d) => d.value === state.day) ? state.day : null;
  const hours = day ? getHourChoices(day, now) : [];
  const hour = hours.some((h) => h.value === state.hour) ? state.hour : null;
  const minutes = hour ? getMinuteChoices(day, hour, now) : [];

  const select = (customId, placeholder, options, selected) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(options.map((option) => ({ ...option, default: option.value === selected }))),
    );

  const rows = [select(`atm:pickday:${draftId}`, 'Sélectionne la date', days, day)];
  if (day) rows.push(select(`atm:pickhour:${draftId}:${day}`, "Sélectionne l'heure", hours, hour));
  if (hour) rows.push(select(`atm:pickmin:${draftId}:${day}:${hour}`, 'Sélectionne les minutes', minutes, state.minute));
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`atm:pickback:${draftId}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJI.BOUTON_RETOUR)
        .setLabel('Retour'),
    ),
  );
  return rows;
}

module.exports = {
  buildDatePickerRows,
  getDayChoices,
  getHourChoices,
  getMinuteChoices,
  getPickerState,
  isSlotAvailable,
  toSlot,
};
