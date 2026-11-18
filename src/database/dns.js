const dns = require('node:dns');
const { logAction } = require('../utils/logger');

/** DNS publics utilisés quand celui de l'hébergeur ne répond pas. */
const FALLBACK_SERVERS = ['1.1.1.1', '8.8.8.8'];
/** Erreurs de résolution qui peuvent venir d'une panne du DNS de l'hébergeur. */
const DNS_ERRORS = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED']);

const fallbackResolver = new dns.Resolver({ timeout: 3000, tries: 2 });
fallbackResolver.setServers(FALLBACK_SERVERS);

/** Dernières adresses connues de chaque serveur MongoDB. */
const knownAddresses = new Map();
let usingFallback = false;

function answer(callback, options, addresses) {
  if (options.all) return callback(null, addresses);
  return callback(null, addresses[0].address, addresses[0].family);
}

/** Journalise le passage au DNS de secours, puis le retour au DNS de l'hébergeur (une seule fois chacun). */
function setFallback(active, detail) {
  if (active === usingFallback) return;
  usingFallback = active;
  logAction('MongoDB', active ? `DNS de l'hébergeur indisponible (${detail}) : DNS de secours utilisé` : "DNS de l'hébergeur de nouveau disponible");
}

/**
 * Résolution des adresses des serveurs MongoDB (option `lookup` du driver). Si le DNS de l'hébergeur échoue
 * (ex : EAI_AGAIN), on interroge des DNS publics, puis on réutilise la dernière adresse connue du serveur.
 */
function resilientLookup(hostname, options, callback) {
  if (typeof options === 'function') [callback, options] = [options, {}];
  if (typeof options === 'number') options = { family: options };

  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (!error) {
      knownAddresses.set(hostname, addresses);
      setFallback(false);
      return answer(callback, options, addresses);
    }
    if (!DNS_ERRORS.has(error.code)) return callback(error);

    setFallback(true, error.code);
    fallbackResolver.resolve4(hostname, (fallbackError, ips) => {
      if (!fallbackError && ips.length) {
        const resolved = ips.map((address) => ({ address, family: 4 }));
        knownAddresses.set(hostname, resolved);
        return answer(callback, options, resolved);
      }
      const known = knownAddresses.get(hostname);
      if (known) return answer(callback, options, known);
      return callback(error);
    });
  });
}

/** Ajoute les DNS publics après ceux de l'hébergeur pour la résolution SRV des URI « mongodb+srv:// ». */
function addFallbackDnsServers() {
  const servers = dns.getServers();
  dns.setServers([...servers, ...FALLBACK_SERVERS.filter((server) => !servers.includes(server))]);
}

module.exports = { resilientLookup, addFallbackDnsServers };
