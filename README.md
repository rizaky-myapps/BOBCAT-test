# BOBCAT — Bot Discord « Session ATM »

Bot Discord (**discord.js v14**) qui organise les sessions de ravitaillement d'ATM :

- la commande `/superviseur` définit les superviseurs proposés dans `/atm` ;
- la commande `/atm` affiche un aperçu du message, à compléter avec ses boutons ;
- le bot publie l'annonce au format **Components V2** dans un salon dédié ;
- les agents s'inscrivent avec le bouton **« Je suis disponible »**.

Tous les messages du bot sont au format Components V2 (séparateur, container, séparateur).
Les sessions, brouillons et superviseurs sont stockés dans **MongoDB** (via **mongoose**), dans les collections
`Sessions-ATM`, `Sessions-ATM-Draft` et `Superviseur-List`. Le service **Cloudinary** est configuré mais pas encore utilisé.

---

## Prérequis

- Node.js **20.19** ou plus récent (requis par mongoose 9)
- Une base MongoDB (locale ou MongoDB Atlas)
- Un compte Cloudinary (gratuit)
- Une application Discord avec un bot : <https://discord.com/developers/applications>

## Installation

```bash
npm install
```

```bash
cp .env.example .env
```

Remplis ensuite le fichier `.env` :

| Variable | Obligatoire | Utilisation |
| --- | --- | --- |
| `BOBCAT_DISCORD_BOT_TOKEN` | ✅ | Token du bot |
| `BOBCAT_GUILD_ID` | | Serveur où les commandes sont enregistrées au démarrage (instantané). Vide = commandes globales (jusqu'à 1h de propagation) |
| `BOBCAT_DIRECTION_ROLE_ID` | | Pas encore utilisé |
| `BOBCAT_CO_ATM_ROLE_ID` | ✅ (`/superviseur`) | Membres proposés dans `/superviseur` · les membres ayant ce rôle n'ont pas besoin de superviseur |
| `BOBCAT_EMPLOYEES_ROLE_ID` | | Rôle mentionné quand « Ping agents » est sur OUI. Vide = `@everyone` |
| `BOBCAT_UNITE_2_ROUES_ROLE_ID` · `BOBCAT_UNITE_K9_ROLE_ID` · `BOBCAT_RECRUTEUR_ROLE_ID` · `BOBCAT_FORMATEUR_ROLE_ID` | | Pas encore utilisés |
| `BOBCAT_FUSIL_A_POMPE_ROLE_ID` | | Logo 🔫 sur le dispatch |
| `BOBCAT_FUSIL_ANTI_EMEUTE_ROLE_ID` | | Pas encore utilisé |
| `BOBCAT_SESSION_ATM_CHANNEL_ID` | ✅ | Salon où les sessions ATM sont publiées |
| `BOBCAT_COATM_CHANNEL_ID` | ✅ (supervision) | Salon où le superviseur sélectionné est prévenu et répond |
| `BOBCAT_PDS_ATM_CHANNEL_ID` · `BOBCAT_PDS_PATROUILLE_CHANNEL_ID` | | Pas encore utilisés |
| `BOBCAT_LOGS_CHANNEL_ID` | | Salon des logs (ex : superviseur retiré de la liste) |
| `MONGODB_URI` | ✅ | URI de connexion MongoDB |
| `MONGODB_FOLDER` | | Nom de la base MongoDB |
| `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` · `CLOUDINARY_FOLDER` | | Cloudinary (pas encore utilisé) |
| `TIMEZONE` | | Fuseau horaire de la date saisie (défaut : `Europe/Paris`) |

Lance le bot :

```bash
npm start
```

Au démarrage, le bot enregistre (ou met à jour) automatiquement les commandes `/atm` et `/superviseur` auprès de Discord. Aucune étape de déploiement séparée n'est nécessaire.

### Permissions du bot

Dans le salon `BOBCAT_SESSION_ATM_CHANNEL_ID`, le bot a besoin de : **Voir le salon**, **Envoyer des messages** et, pour le ping, **Mentionner @everyone, @here et tous les rôles** (ou un `BOBCAT_EMPLOYEES_ROLE_ID` mentionnable).
Dans le salon `BOBCAT_COATM_CHANNEL_ID` : **Voir le salon** et **Envoyer des messages**.

**Intent privilégié obligatoire** : active **Server Members Intent** dans le portail développeur
(*ton application → Bot → Privileged Gateway Intents*). Il sert à lister les membres ayant un rôle (CO ATM, Fusil à pompe…).
Sans lui, le bot refuse de démarrer (`Used disallowed intents`).

Pour limiter qui peut utiliser `/atm` ou `/superviseur` : *Paramètres du serveur → Intégrations → ton bot*.

---

## Utilisation

### 1. `/superviseur` : liste des superviseurs

Ouvre un modal avec un menu listant les membres qui ont le rôle `BOBCAT_CO_ATM_ROLE_ID` (25 maximum).
Les superviseurs déjà enregistrés sont pré-sélectionnés : la sélection validée devient la liste des superviseurs en base.

Un superviseur qui perd le rôle CO-ATM (ou quitte le serveur) est retiré automatiquement de la liste **1h après**
(vérification toutes les minutes) s'il ne l'a pas récupéré entre-temps. Un log est alors envoyé dans `BOBCAT_LOGS_CHANNEL_ID`.

### 2. `/atm` : aperçu et création d'une session

`/atm` affiche (pour toi seul) un aperçu du message qui sera envoyé. Le bouton ⚙️ y est désactivé et la liste des agents disponibles est remplacée par des boutons :

| Bouton | Action |
| --- | --- |
| 📝 Informations | Ouvre le modal des informations (pré-rempli si tu l'as déjà rempli) |
| 🚙 Choisir la plaque | Affiché seulement si « Autre » est choisi comme véhicule : ouvre un modal pour saisir la plaque |
| 🔔 Ping agents : OUI / 🔕 NON | Active ou désactive le ping des agents (OUI par défaut) |
| 📨 Envoyer | Publie la session dans `BOBCAT_SESSION_ATM_CHANNEL_ID`. Actif une fois toutes les informations renseignées (et la présence du superviseur validée) |

Le modal « Informations » contient :

| Champ | Type | Choix |
| --- | --- | --- |
| Date & Heure | Zone de texte | Format `JJ/MM/AAAA HH:MM` (ex : `31/10/2026 21:00`) |
| Choix de la tenue | Menu de sélection | CDF/ATM Long, CDF/ATM Court |
| Fréquence radio | Menu de sélection | Sierra 6, Sierra 7, Sierra 8 |
| Choix du véhicule | Menu de sélection | ZJR 325, ABC 123, Autre |
| Choix du superviseur | Menu de sélection | Superviseurs enregistrés via `/superviseur` — **uniquement si tu n'as pas le rôle CO ATM** |

L'aperçu est mis à jour à chaque modification. Si tu relances `/atm`, ton brouillon est réutilisé. Seul son créateur peut le modifier.
Un brouillon non envoyé est supprimé 5h après sa création (vérification toutes les 10 minutes).

#### Validation du superviseur

Si tu n'as pas le rôle CO ATM, le superviseur sélectionné doit valider sa présence avant que la session puisse être envoyée :

1. Une demande est envoyée dans le salon `BOBCAT_COATM_CHANNEL_ID` (le superviseur est mentionné), avec les boutons **✅ Je suis disponible** et **❌ Pas disponible**. Seul le superviseur sélectionné peut y répondre.
2. Tant qu'il n'a pas répondu, les boutons **Informations** et **Choisir la plaque** de l'aperçu sont désactivés.
3. **Disponible** : sa présence est validée, le bouton **Envoyer** s'active.
4. **Pas disponible**, ou **pas de réponse dans les 10 minutes** (compté comme un refus) : le superviseur est retiré, choisis-en un autre via **Informations**.

Tu es prévenu de sa réponse par un message, et ton aperçu se met à jour. Si l'aperçu a été ouvert il y a plus de 15 minutes, relance `/atm` pour le voir à jour.
Une fois sa présence validée, le superviseur ne peut plus être changé : la question disparaît du modal « Informations » (les autres informations restent modifiables).
Si la date est invalide, la demande n'est envoyée qu'une fois la date corrigée.

### 3. L'annonce

Le message est publié dans `BOBCAT_SESSION_ATM_CHANNEL_ID` au format Components V2, d'après le modèle fourni :

- la date et l'heure en timestamps Discord (`<t:…:d>`, `<t:…:t>`, `<t:…:R>`), affichés dans le fuseau horaire de chaque membre ;
- le ping `@everyone` (ou le rôle `BOBCAT_EMPLOYEES_ROLE_ID`) seulement si « Ping agents » est sur OUI ;
- les informations (radio `S6`/`S7`/`S8`, tenue, véhicule, statut) ;
- les agents sur dispatch : n°1 le créateur de la session, n°2 le superviseur (s'il y en a un), n°3 et n°4 à définir une fois la session postée ;
- la liste des agents disponibles.

Logos à côté des agents sur dispatch :

| Logo | Attribué à |
| --- | --- |
| 🛡️ | Créateur de la session (chef d'opération) |
| 🧳 | Superviseur sélectionné |
| 🔫 | Membre ayant le rôle `BOBCAT_FUSIL_A_POMPE_ROLE_ID` |

Les mentions du message (superviseur, agents, rôle) mentionnent réellement les personnes. Discord n'envoie une notification qu'à la publication du message : une personne ajoutée ensuite (par exemple via « Je suis disponible ») apparaît en surbrillance mais ne reçoit pas de notification.

**« Je suis disponible »** : un clic t'ajoute à la liste, un second clic t'en retire. Les agents sur le dispatch ne peuvent pas se retirer.
Le superviseur de la session, et le créateur quand il est CO-ATM (session sans superviseur), ne peuvent pas l'utiliser.

### 4. Le bouton ⚙️

Seul le créateur de la session peut l'utiliser ; il répond « 🚧 En développement ».

---

## Structure du projet

```
src/
├── index.js                 # Démarrage du bot (MongoDB, client Discord, enregistrement des commandes, tâches de fond)
├── jobs.js                  # Tâches de fond : brouillons expirés, demandes sans réponse, superviseurs sans le rôle CO-ATM
├── config.js                # Lecture / validation du .env
├── commands/
│   ├── index.js             # Liste des commandes
│   ├── deploy.js            # Enregistrement des commandes slash (appelé au démarrage)
│   ├── atm.js               # /atm → aperçu du message
│   └── superviseur.js       # /superviseur → modal des membres ayant le rôle superviseur
├── interactions/
│   ├── index.js             # Routage des commandes, boutons, menus et modals
│   ├── atmPreview.js        # Boutons et modals de l'aperçu /atm (informations, plaque, ping, envoi)
│   ├── supervisor.js        # Modal /superviseur et réponses du superviseur (salon CO-ATM)
│   └── atmSession.js        # Boutons « Je suis disponible » et ⚙️
├── atm/
│   ├── constants.js         # Choix des menus, statuts, rôles de la légende, limites
│   ├── modals.js            # Construction des modals
│   ├── message.js           # Rendu de l'annonce (Components V2)
│   ├── preview.js           # Rendu de l'aperçu /atm
│   ├── supervision.js       # Demande de supervision (message CO-ATM, délai de 10 min, mise à jour de l'aperçu)
│   ├── supervisorRoles.js   # Retrait des superviseurs ayant perdu le rôle CO-ATM depuis 1h
│   └── service.js           # Publication, dispatch et logos des agents
├── models/
│   ├── AtmSession.js        # Collection « Sessions-ATM » : sessions publiées
│   ├── AtmDraft.js          # Collection « Sessions-ATM-Draft » : brouillons /atm (supprimés après 5h)
│   └── Supervisor.js        # Collection « Superviseur-List » : superviseurs (/superviseur)
├── services/cloudinary.js   # Envoi / suppression d'images sur Cloudinary (pas encore utilisé)
├── database/mongoose.js     # Connexion MongoDB
└── utils/
    ├── date.js              # Conversion « JJ/MM/AAAA HH:MM » ⇄ timestamp
    ├── logs.js              # Envoi des logs dans BOBCAT_LOGS_CHANNEL_ID
    └── v2.js                # Messages texte au format Components V2
```

Pour modifier les choix (tenues, fréquences, véhicules, rôles, statuts) ou les limites, édite `src/atm/constants.js`.
