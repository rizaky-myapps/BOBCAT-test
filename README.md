# BOBCAT — Bot Discord « Session ATM »

Bot Discord (**discord.js v14**) qui organise les sessions de ravitaillement d'ATM :

- la commande `/superviseur` définit les superviseurs proposés dans `/atm` ;
- la commande `/atm` affiche un aperçu du message, à compléter avec ses boutons ;
- le bot publie l'annonce au format **Components V2** dans un salon dédié ;
- les agents s'inscrivent avec le bouton **« Je suis disponible »** ;
- le CO-ATM (l'organisateur de la session) la gère avec le bouton **⚙️** : dispatching, informations, début, PDS ATM, fin ou annulation.

Tous les messages du bot sont au format Components V2 (séparateur, container, séparateur).
Les sessions, brouillons, superviseurs et PDS sont stockés dans **MongoDB** (via **mongoose**), dans les collections
`Sessions-ATM`, `Sessions-ATM-Draft`, `Superviseur-List` et `PDS-ATM`. Les photos des PDS ATM sont hébergées sur **Cloudinary**.

> **CO-ATM** désigne dans ce document l'organisateur d'une session (celui qui l'a créée avec `/atm`),
> à ne pas confondre avec le **rôle** CO ATM (`BOBCAT_CO_ATM_ROLE_ID`), qui indique seulement qu'un membre n'a plus besoin d'être supervisé.

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
| `BOBCAT_DIRECTION_ROLE_ID` | | Peut gérer toutes les sessions (⚙️, question « maintenue ? ») et modifier les PDS |
| `BOBCAT_CO_ATM_ROLE_ID` | ✅ (`/superviseur`) | Membres proposés dans `/superviseur` · les membres ayant ce rôle n'ont pas besoin de superviseur |
| `BOBCAT_EMPLOYEES_ROLE_ID` | | Rôle mentionné quand « Ping agents » est sur OUI. Vide = `@everyone` |
| `BOBCAT_UNITE_2_ROUES_ROLE_ID` | | Seuls ces membres peuvent être le motard du dispatching |
| `BOBCAT_UNITE_K9_ROLE_ID` · `BOBCAT_RECRUTEUR_ROLE_ID` · `BOBCAT_FORMATEUR_ROLE_ID` | | Pas encore utilisés |
| `BOBCAT_FUSIL_A_POMPE_ROLE_ID` | | Logo 🔫 sur le dispatch |
| `BOBCAT_FUSIL_ANTI_EMEUTE_ROLE_ID` | | Pas encore utilisé |
| `BOBCAT_SESSION_ATM_CHANNEL_ID` | ✅ | Salon où les sessions ATM sont publiées |
| `BOBCAT_COATM_CHANNEL_ID` | ✅ (supervision) | Salon où le superviseur sélectionné est prévenu et répond |
| `BOBCAT_PDS_ATM_CHANNEL_ID` | ✅ (PDS) | Salon où les PDS ATM sont envoyées |
| `BOBCAT_PDS_PATROUILLE_CHANNEL_ID` | | Pas encore utilisé |
| `BOBCAT_LOGS_CHANNEL_ID` | | Salon des logs (ex : superviseur retiré de la liste) |
| `MONGODB_URI` | ✅ | URI de connexion MongoDB |
| `MONGODB_FOLDER` | | Nom de la base MongoDB |
| `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` · `CLOUDINARY_FOLDER` | ✅ (PDS) | Cloudinary : photos des PDS ATM |
| `TIMEZONE` | | Fuseau horaire de la date saisie (défaut : `Europe/Paris`) |

Lance le bot :

```bash
npm start
```

Au démarrage, le bot enregistre (ou met à jour) automatiquement les commandes `/atm` et `/superviseur` auprès de Discord. Aucune étape de déploiement séparée n'est nécessaire.

### Permissions du bot

Dans le salon `BOBCAT_SESSION_ATM_CHANNEL_ID`, le bot a besoin de : **Voir le salon**, **Envoyer des messages** et, pour le ping, **Mentionner @everyone, @here et tous les rôles** (ou un `BOBCAT_EMPLOYEES_ROLE_ID` mentionnable).
Dans les salons `BOBCAT_COATM_CHANNEL_ID`, `BOBCAT_PDS_ATM_CHANNEL_ID` et `BOBCAT_LOGS_CHANNEL_ID` : **Voir le salon** et **Envoyer des messages**.

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

Si tu diriges déjà une session prévue aujourd'hui, ou si tu es sur le dispatch de l'une d'elles (hors sessions annulées),
`/atm` t'en informe avec le lien vers la session et un bouton **« Poster quand même »** qui affiche l'aperçu.

Règles sur la date (vérifiées à la saisie et à l'envoi) :

- elle ne peut pas être dans le passé (la minute en cours est acceptée) ;
- une session dure environ **1h30** : impossible de diriger une session qui chevauche une autre session sur laquelle tu es
  (CO-ATM, dispatch ou vote « Je suis disponible »). Tu peux en prévoir une plus tard.

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
- les agents sur dispatch : n°1 le CO-ATM, n°2 le superviseur (s'il y en a un), puis les agents choisis avec « Dispatching » ;
- la liste des agents disponibles.

Logos à côté des agents sur dispatch :

| Logo | Attribué à |
| --- | --- |
| 🛡️ | CO-ATM (chef d'opération) |
| 🧳 | Superviseur sélectionné |
| 🔫 | Membre ayant le rôle `BOBCAT_FUSIL_A_POMPE_ROLE_ID` |
| 🚙 | Conducteur (choisi au dispatching) |
| 🏍️ | Motard (choisi au dispatching, rôle `BOBCAT_UNITE_2_ROUES_ROLE_ID`) |

Les mentions du message (agents, rôle) mentionnent réellement les personnes. Discord n'envoie une notification qu'à la publication du message : une personne ajoutée ensuite (par exemple via « Je suis disponible ») apparaît en surbrillance mais ne reçoit pas de notification.

**« Je suis disponible »** : un clic t'ajoute à la liste, un second clic t'en retire. Seuls les membres qui ne sont **pas sur le dispatch** peuvent l'utiliser (qu'ils aient le rôle CO ATM ou non) : le CO-ATM et le superviseur ne le peuvent pas. Le bouton devient inutilisable une fois le dispatching fait.
Il est aussi impossible de voter pour une session qui chevauche (moins de 1h30 d'écart) une autre session sur laquelle tu es déjà.

### 4. Le bouton ⚙️ : gestion de la session

Réservé au CO-ATM de la session et aux membres ayant le rôle `BOBCAT_DIRECTION_ROLE_ID`. Il ouvre un panneau privé.

**Avant le début de la session :**

| Bouton | Action |
| --- | --- |
| 🛑 Annuler | Modal : raison (liste) + précision obligatoire si « Autre ». Statut « Annulée », liseré rouge, tous les boutons désactivés |
| 👥 Dispatching | Modal 1 : agents ayant voté (1 à 4, ou 1 à 3 avec un superviseur). Puis bouton **Choisir le conducteur** → modal 2 : conducteur (et motard). Le dispatch est mis à jour et « Je suis disponible » devient inutilisable |
| 📝 Informations | Modifier la radio, le véhicule (plaque si « Autre ») et la tenue |
| ▶️ Commencer | Statut « En cours... » ; le panneau affiche alors les boutons ci-dessous. Il faut au moins **3 personnes** sur le dispatch (CO-ATM + 2 agents, ou CO-ATM + superviseur + 1 agent) |

Le véhicule compte 4 places (CO-ATM et superviseur compris) ; un agent de plus peut suivre en moto s'il a le rôle Unité 2 roues :
sans superviseur, 3 agents dans le véhicule + 1 en moto ; avec superviseur, 2 agents dans le véhicule + 1 en moto.
Discord ne permet pas d'ouvrir un modal directement après un autre, d'où le bouton intermédiaire « Choisir le conducteur ».

**Pendant la session :**

| Bouton | Action |
| --- | --- |
| 📦 Nouvelle PDS | Modal : nombre de mallettes (1 à 5) + photo de l'emplacement de l'ATM. Envoie la PDS dans `BOBCAT_PDS_ATM_CHANNEL_ID` |
| 🏁 Finir la session | Statut « Terminée » ; tous les boutons sont désactivés (✏️ des PDS de la session compris) |

### 5. Avant le début de la session

- **30 minutes avant** l'heure prévue, si la session est « En attente... » et pas encore dispatchée :
  - s'il y a assez d'agents disponibles pour la commencer (2, ou 1 avec un superviseur), le CO-ATM est mentionné dans `BOBCAT_COATM_CHANNEL_ID` pour qu'il fasse son dispatch ;
  - sinon, la session est **annulée** (manque d'agents) et un message, sans mention, l'indique dans `BOBCAT_COATM_CHANNEL_ID`.

  Cette vérification n'est pas faite pour une session postée moins de 30 minutes avant son heure.
- **15 minutes avant**, si le dispatching est fait, les agents dispatchés (superviseur compris) sont mentionnés dans le salon des sessions pour un rappel.

### 6. Session non commencée

30 minutes après l'heure prévue, si la session n'a pas commencé, le CO-ATM est mentionné dans `BOBCAT_COATM_CHANNEL_ID`
avec deux boutons (CO-ATM et direction) :

- **Maintenu** : le CO-ATM a 10 minutes pour la commencer. Sinon elle est annulée, et les agents ayant voté « Je suis disponible » sont prévenus par un ping dans le salon des sessions ;
- **Annuler** : même modal que le bouton « Annuler » du panneau.

### 7. PDS ATM

Chaque PDS envoyée affiche la photo de l'emplacement (hébergée sur Cloudinary), l'immatriculation du véhicule de la session,
les agents du dispatch (en texte, d'après leur surnom sur le serveur, au format `[22] • Yvick Waler`), le nombre de mallettes
et la date prévue de la session. En dessous : le numéro de l'ATM dans la journée et un lien vers la session.

- **Numéro** : il repart à `01` chaque jour. Le jour retenu est celui de la date prévue de la session : une session prévue à 23h dont une PDS est postée à 0h01 continue la numérotation de la veille.
- **✏️** : modifier la photo (l'ancienne est supprimée de Cloudinary) et le nombre de mallettes. Réservé au CO-ATM et à la direction, et seulement tant que la session est en cours : le bouton est désactivé quand la session est terminée.

---

## Structure du projet

```
src/
├── index.js                 # Démarrage du bot (MongoDB, client Discord, enregistrement des commandes, tâches de fond)
├── jobs.js                  # Tâches de fond : brouillons expirés, demandes sans réponse, superviseurs sans le rôle CO-ATM, sessions non commencées
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
│   ├── atmSession.js        # Boutons « Je suis disponible » et ⚙️
│   ├── atmPanel.js          # Actions du panneau ⚙️ et de la question « maintenue ? »
│   └── pds.js               # Bouton ✏️ des PDS ATM
├── atm/
│   ├── constants.js         # Choix des menus, statuts, rôles de la légende, limites
│   ├── modals.js            # Construction des modals
│   ├── message.js           # Rendu de l'annonce (Components V2)
│   ├── preview.js           # Rendu de l'aperçu /atm
│   ├── supervision.js       # Demande de supervision (message CO-ATM, délai de 10 min, mise à jour de l'aperçu)
│   ├── panel.js             # Panneau ⚙️ d'une session postée
│   ├── sessionModals.js     # Modals du panneau ⚙️ et des PDS
│   ├── lifecycle.js         # Annuler / commencer / finir une session, annulation automatique
│   ├── startCheck.js        # Question « session maintenue ? » 30 min après l'heure prévue
│   ├── reminders.js         # 30 min avant : dispatching (rappel au CO-ATM ou annulation) ; 15 min avant : rappel aux agents
│   ├── pds.js               # PDS ATM : message, numéro du jour, photo Cloudinary
│   ├── supervisorRoles.js   # Retrait des superviseurs ayant perdu le rôle CO-ATM depuis 1h
│   └── service.js           # Publication, dispatch et logos des agents
├── models/
│   ├── AtmSession.js        # Collection « Sessions-ATM » : sessions publiées
│   ├── AtmDraft.js          # Collection « Sessions-ATM-Draft » : brouillons /atm (supprimés après 5h)
│   ├── Supervisor.js        # Collection « Superviseur-List » : superviseurs (/superviseur)
│   └── PdsAtm.js            # Collection « PDS-ATM » : PDS ATM
├── services/cloudinary.js   # Envoi / suppression d'images sur Cloudinary (photos des PDS)
├── database/mongoose.js     # Connexion MongoDB
└── utils/
    ├── date.js              # Conversion « JJ/MM/AAAA HH:MM » ⇄ timestamp
    ├── logs.js              # Envoi des logs dans BOBCAT_LOGS_CHANNEL_ID
    └── v2.js                # Messages texte au format Components V2
```

Pour modifier les choix (tenues, fréquences, véhicules, rôles, statuts) ou les limites, édite `src/atm/constants.js`.
