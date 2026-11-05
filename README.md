# BOBCAT — Bot Discord « Session ATM »

Bot Discord (**discord.js v14**) qui organise les sessions de ravitaillement d'ATM :

- la commande `/atm` ouvre un formulaire (modal) ;
- le bot publie une annonce au format **Components V2** dans un salon dédié ;
- les agents s'inscrivent avec le bouton **« Je suis disponible »** ;
- le créateur (ou un responsable) gère la session avec le bouton **⚙️** : dispatch, rôles, statut, modification, photos.

Les sessions sont stockées dans **MongoDB** (via **mongoose**) et les photos sont sauvegardées sur **Cloudinary**.

---

## Prérequis

- Node.js **20.19** ou plus récent (requis par mongoose 9)
- Une base MongoDB (locale ou MongoDB Atlas)
- Un compte Cloudinary (gratuit), pour les photos des sessions
- Une application Discord avec un bot : <https://discord.com/developers/applications>

## Installation

```bash
npm install
```

```bash
cp .env.example .env
```

Remplis ensuite le fichier `.env` :

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | Token du bot |
| `DISCORD_GUILD_ID` | | Serveur où `/atm` est enregistrée au démarrage (instantané). Vide = commande globale (jusqu'à 1h de propagation) |
| `ATM_CHANNEL_ID` | ✅ | Salon où les sessions ATM sont publiées |
| `ATM_PING_ROLE_ID` | | Rôle mentionné si « Ping employés ? » = OUI. Vide = `@everyone` |
| `ATM_MANAGER_ROLE_IDS` | | Rôles (séparés par des virgules) autorisés à gérer **toutes** les sessions via ⚙️ |
| `TIMEZONE` | | Fuseau horaire de la date saisie (défaut : `Europe/Paris`) |
| `MONGODB_URI` | ✅ | URI de connexion MongoDB |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | | Identifiants Cloudinary. Sans eux, le bot fonctionne mais l'ajout de photos est désactivé |
| `CLOUDINARY_FOLDER` | | Dossier Cloudinary (défaut : `bobcat/atm`) |

Lance le bot :

```bash
npm start
```

Au démarrage, le bot enregistre (ou met à jour) automatiquement la commande `/atm` auprès de Discord. Aucune étape de déploiement séparée n'est nécessaire.

### Permissions du bot

Dans le salon `ATM_CHANNEL_ID`, le bot a besoin de : **Voir le salon**, **Envoyer des messages** et, pour le ping, **Mentionner @everyone, @here et tous les rôles** (ou un `ATM_PING_ROLE_ID` mentionnable).
Seul l'intent `Guilds` est utilisé : aucun intent privilégié n'est nécessaire.

Pour limiter qui peut utiliser `/atm` : *Paramètres du serveur → Intégrations → ton bot → /atm*.

---

## Utilisation

### 1. `/atm` : création d'une session

Le modal contient :

| Champ | Type | Choix |
| --- | --- | --- |
| Date & Heure | Zone de texte | Format `JJ/MM/AAAA HH:MM` (ex : `31/10/2026 21:00`) |
| Choix de la tenue | Menu de sélection | CDF/ATM Long, CDF/ATM Court |
| Fréquence radio | Menu de sélection | Sierra 6, Sierra 7, Sierra 8 |
| Choix du véhicule | Menu de sélection | ZJR 325, ABC 123, Autre |
| Ping employés ? | Menu de sélection | OUI, NON |

**Option « Autre »** : Discord n'autorise pas un bot à ouvrir un modal en réponse à un autre modal.
Après l'envoi du premier modal, le bot affiche donc un message (visible par toi seul) avec un bouton
**« 🚙 Renseigner le véhicule »** qui ouvre le second modal (zone de texte « Véhicule utilisé »).
Si la date est invalide, le même mécanisme permet de la corriger sans tout ressaisir.

Les réponses du premier modal sont transportées dans l'identifiant du bouton : rien n'est perdu, même si le bot redémarre entre les deux étapes.

### 2. L'annonce

Le message est publié dans `ATM_CHANNEL_ID` au format Components V2, d'après le modèle fourni :

- la date et l'heure en timestamps Discord (`<t:…:d>`, `<t:…:t>`, `<t:…:R>`), affichés dans le fuseau horaire de chaque membre ;
- le ping `@everyone` (ou le rôle configuré) seulement si « Ping employés ? » = OUI ;
- les informations (radio `S6`/`S7`/`S8`, tenue, véhicule, statut) ;
- la liste des agents sur dispatch avec leurs rôles (🛡️ 🧳 🔫 🚙 🆕) ;
- la liste des agents disponibles.

**« Je suis disponible »** : un clic t'ajoute à la liste, un second clic t'en retire (et te retire aussi du dispatch).
Le bouton est désactivé quand la session est *Terminée* ou *Annulée*.

### 3. Le bouton ⚙️ (gestion)

Réservé au créateur de la session, aux membres ayant la permission **Gérer le serveur** et aux rôles `ATM_MANAGER_ROLE_IDS`.
Il ouvre un panneau privé qui permet de :

- **choisir les agents sur dispatch** (5 maximum) ;
- **🏷️ attribuer les rôles** de la légende à chaque agent du dispatch ;
- **changer le statut** : En attente..., En cours, Terminée, Annulée ;
- **✏️ modifier les infos** : date, tenue, radio, véhicule ;
- **📸 ajouter des photos** (10 maximum) : elles sont envoyées sur Cloudinary puis affichées dans l'annonce. Les liens des pièces jointes Discord expirent, alors que Cloudinary les conserve ;
- **🧹 retirer les photos** (elles sont aussi supprimées de Cloudinary).

Chaque modification met immédiatement l'annonce à jour, sans renvoyer de ping.

---

## Structure du projet

```
src/
├── index.js                 # Démarrage du bot (MongoDB, client Discord, enregistrement des commandes)
├── config.js                # Lecture / validation du .env
├── commands/
│   ├── index.js             # Liste des commandes
│   ├── deploy.js            # Enregistrement des commandes slash (appelé au démarrage)
│   └── atm.js               # /atm → ouvre le modal
├── interactions/
│   ├── index.js             # Routage des commandes, boutons, menus et modals
│   ├── atmCreate.js         # Modal /atm, bouton et modal « véhicule Autre / date »
│   ├── atmSession.js        # Boutons « Je suis disponible » et ⚙️
│   └── atmPanel.js          # Actions du panneau de gestion
├── atm/
│   ├── constants.js         # Choix des menus, statuts, rôles de la légende, limites
│   ├── draft.js             # Encodage des réponses entre les deux modals
│   ├── modals.js            # Construction des modals
│   ├── message.js           # Rendu de l'annonce (Components V2)
│   ├── panel.js             # Rendu du panneau ⚙️
│   └── service.js           # Publication, mise à jour du message, permissions
├── models/AtmSession.js     # Schéma mongoose d'une session
├── services/cloudinary.js   # Envoi / suppression d'images sur Cloudinary
├── database/mongoose.js     # Connexion MongoDB
└── utils/date.js            # Conversion « JJ/MM/AAAA HH:MM » ⇄ timestamp
```

Pour modifier les choix (tenues, fréquences, véhicules, rôles, statuts) ou les limites, édite `src/atm/constants.js`.
