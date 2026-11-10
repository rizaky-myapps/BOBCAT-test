# BOBCAT — Guide d'utilisation du bot « Session ATM »

Le bot organise les sessions de ravitaillement d'ATM (distributeurs) : création et annonce de la session, inscription des agents, supervision, dispatching, suivi des PDS (distributeurs remplis) et rappels automatiques.

---

## Vocabulaire

| Terme | Signification |
| --- | --- |
| **CO-ATM** | L'organisateur d'une session : la personne qui l'a créée avec `/atm`. Il la dirige. |
| **Rôle CO ATM** | Rôle Discord indiquant qu'un membre n'a plus besoin d'être supervisé. Ces membres peuvent aussi être choisis comme superviseurs. |
| **Superviseur** | Membre ayant le rôle CO ATM qui accompagne un CO-ATM n'ayant pas encore ce rôle. |
| **Direction** | Membres ayant le rôle Direction : ils peuvent gérer toutes les sessions comme le CO-ATM. |
| **Dispatch** | Les personnes retenues pour la session : le CO-ATM, le superviseur, puis les agents choisis. |
| **PDS ATM** | Le compte rendu d'un distributeur rempli pendant la session. |

---

## Les commandes

### `/superviseur` : choisir les superviseurs

1. Tape `/superviseur`.
2. Un formulaire s'ouvre avec la liste des membres ayant le rôle CO ATM (25 au maximum). Les superviseurs actuels sont déjà cochés.
3. Coche ou décoche les membres, puis valide : ta sélection devient la liste des superviseurs proposés dans `/atm`.

> Un superviseur qui perd le rôle CO ATM (ou quitte le serveur) est retiré automatiquement de la liste **1 heure** plus tard, s'il ne l'a pas récupéré entre-temps. Un message l'indique dans le salon des logs.

### `/atm` : créer une session

#### Étape 1 — Lancer la commande

Tape `/atm`. Le bot t'affiche, à toi seul, un **aperçu** du message qui sera publié.

- Si tu diriges déjà une session prévue aujourd'hui, ou si tu es sur le dispatch de l'une d'elles, le bot te prévient avec le lien vers cette session. Le bouton **📨 Poster quand même** affiche l'aperçu.
- Si tu avais déjà commencé une session sans l'envoyer, ton **brouillon est repris** là où tu l'avais laissé. Un brouillon non envoyé est supprimé 5 heures après sa création.

#### Étape 2 — Compléter l'aperçu

Dans l'aperçu, la liste des agents est remplacée par des boutons, et le bouton ⚙️ est grisé :

| Bouton | Ce qu'il fait |
| --- | --- |
| 📝 **Informations** | Ouvre le formulaire de la session (voir ci-dessous). Il est pré-rempli avec ce que tu as déjà saisi. |
| 🚙 **Choisir la plaque** | N'apparaît que si tu as choisi le véhicule « Autre » : permet de saisir la plaque du véhicule utilisé. |
| 🔔 **Ping agents : OUI** / 🔕 **NON** | Choisit si les employés seront mentionnés à la publication. OUI par défaut ; un clic inverse le choix. |
| 📨 **Envoyer** | Publie la session dans le salon des sessions ATM. Il ne s'active que lorsque tout est rempli (et, si besoin, que le superviseur a validé sa présence). |

L'aperçu se met à jour à chaque modification : ce que tu vois est exactement ce qui sera publié.

Le formulaire **Informations** contient :

| Champ | Choix |
| --- | --- |
| Date & Heure | Format `JJ/MM/AAAA HH:MM` (ex : `31/10/2026 21:00`) |
| Choix de la tenue | CDF/ATM Long, CDF/ATM Court |
| Fréquence radio | Sierra 6, Sierra 7, Sierra 8 |
| Choix du véhicule | ZJR 325, ABC 123, Autre |
| Choix du superviseur | Uniquement si tu **n'as pas** le rôle CO ATM |

Règles sur la date :

- la session doit être postée **au moins 10 minutes** avant son heure de début (à 7h00, 7h10 au plus tôt) ;
- une session dure environ **1h30** : tu ne peux pas en créer une qui chevauche une autre session sur laquelle tu es (en tant que CO-ATM, sur le dispatch ou après avoir voté « Je suis disponible »). Tu peux en prévoir une plus tard ;
- la même règle vaut pour le superviseur : il ne peut pas être sur deux sessions qui se chevauchent.

Si la date ne convient pas, un message t'explique pourquoi et tu peux la corriger via **Informations**.

#### Étape 3 — La validation du superviseur (si tu n'as pas le rôle CO ATM)

1. Dès que tu choisis un superviseur (avec une date valide), une demande est envoyée dans le salon CO-ATM et le superviseur est mentionné.
2. Le superviseur répond avec **✅ Je suis disponible** ou **❌ Pas disponible**. Lui seul peut répondre.
3. Pendant l'attente, les boutons **Informations** et **Choisir la plaque** de ton aperçu sont grisés.
4. Selon la réponse :
   - **Disponible** : sa présence est validée et le bouton **Envoyer** s'active. Le superviseur ne peut plus être changé ; la date, la tenue, la radio et le véhicule restent modifiables.
   - **Pas disponible**, ou **pas de réponse en 10 minutes** : la demande est refusée, choisis un autre superviseur via **Informations**.

Tu reçois un message à chaque réponse et ton aperçu se met à jour. Si ton aperçu a été ouvert il y a plus de 15 minutes, relance `/atm` pour le voir à jour.

Un superviseur déjà sur une session au même moment ne peut pas être choisi ni valider sa présence. S'il est placé sur une autre session au même moment avant que tu envoies, sa présence est annulée et tu dois en choisir un autre.

#### Étape 4 — Envoyer

Clique sur **📨 Envoyer** : la session est publiée dans le salon des sessions ATM. Si **Ping agents** est sur OUI, les employés sont mentionnés.

---

## L'annonce de session

Le message publié contient :

- la **date** et l'**heure** de la session (affichées dans le fuseau horaire de chacun, avec le temps restant) ;
- les **agents sur dispatch** : n°1 le CO-ATM, n°2 le superviseur s'il y en a un, puis les agents choisis au dispatching ;
- les **informations** : radio, tenue, véhicule et statut ;
- la **légende** des logos ;
- la liste des **agents disponibles** et le bouton **Je suis disponible** ;
- en haut à droite, le bouton **⚙️** de gestion.

Logos à côté des agents :

| Logo | Signification |
| --- | --- |
| 🛡️ | CO-ATM (chef d'opération) |
| 🧳 | Superviseur |
| 🚙 | Conducteur |
| 🏍️ | Motard (rôle Unité 2 roues) |
| 🔫 | Habilité au fusil à pompe (toujours affiché en dernier) |

Statuts d'une session :

| Statut | Signification |
| --- | --- |
| En attente... | Session annoncée, pas encore commencée |
| En cours... | Session commencée par le CO-ATM |
| Terminée | Session finie : tous les boutons sont désactivés |
| Annulée | Session annulée : liseré rouge à gauche, tous les boutons désactivés |

### Le bouton « Je suis disponible »

- Un clic t'ajoute à la liste des agents disponibles, un second clic t'en retire.
- Le CO-ATM et les personnes déjà sur le dispatch (superviseur compris) ne peuvent pas l'utiliser.
- Impossible de voter pour une session qui chevauche (moins de 1h30 d'écart) une autre session sur laquelle tu es déjà.
- Le bouton devient inutilisable une fois le dispatching fait, et quand la session est terminée ou annulée.

> Les personnes ajoutées au message après sa publication (par exemple via « Je suis disponible ») apparaissent en surbrillance, mais Discord ne leur envoie pas de notification.

---

## Le bouton ⚙️ : gérer sa session

Réservé au **CO-ATM** de la session et à la **Direction**. Il ouvre un panneau visible par toi seul.

### Avant le début de la session

| Bouton | Ce qu'il fait |
| --- | --- |
| 🛑 **Annuler** | Formulaire avec la raison (Manque d'effectif, CO-ATM indisponible, Superviseur indisponible, Véhicule indisponible, Autre). Si tu choisis « Autre », précise la raison dans le champ prévu, sinon l'annulation est refusée. La session passe en « Annulée ». |
| 👥 **Dispatching** | Choix des agents qui participent (voir ci-dessous). |
| 📝 **Informations** | Modifier la radio, le véhicule (et sa plaque si « Autre ») et la tenue. |
| ▶️ **Commencer** | La session passe en « En cours... ». Il faut un nombre minimum de personnes sur le dispatch, CO-ATM et superviseur compris (3 par défaut : le CO-ATM + 2 agents, ou le CO-ATM + le superviseur + 1 agent). |

#### Tuto : faire le dispatching

1. Clique sur **👥 Dispatching** : un formulaire liste les agents ayant voté « Je suis disponible ».
2. Sélectionne les agents :
   - sans superviseur : de 1 à 4 agents (3 dans le véhicule, le 4e en moto) ;
   - avec superviseur : de 1 à 3 agents (2 dans le véhicule, le 3e en moto).

   L'agent en plus du véhicule part en moto : au moins un des agents sélectionnés doit avoir le rôle **Unité 2 roues**.
3. Valide, puis clique sur le bouton **🚙 Choisir le conducteur** qui apparaît dans le panneau. Discord ne permet pas d'enchaîner deux formulaires, d'où ce bouton.
4. Dans le second formulaire, sélectionne le **conducteur** et, si un agent part en moto, le **motard** (deux personnes différentes).
5. Le dispatch de l'annonce est mis à jour avec les logos 🚙 et 🏍️, et le bouton « Je suis disponible » devient inutilisable.

Tu peux refaire le dispatching tant que la session n'a pas commencé.

### Pendant la session

| Bouton | Ce qu'il fait |
| --- | --- |
| 📦 **Nouvelle PDS** | Déclarer un distributeur rempli (voir ci-dessous). |
| 🏁 **Finir la session** | La session passe en « Terminée » ; tous ses boutons sont désactivés, y compris les ✏️ de ses PDS. |

---

## Les PDS ATM

### Tuto : déclarer une PDS

1. Pendant la session, ouvre **⚙️** puis clique sur **📦 Nouvelle PDS**.
2. Choisis le **nombre de mallettes** utilisées (de 1 à 5).
3. Ajoute la **photo de l'emplacement de l'ATM** : une capture **plein écran** de la carte, avec la croix du curseur sur le distributeur.
4. Valide : la PDS est publiée dans le salon des PDS ATM.

Une PDS n'est possible que pendant une session en cours.

### Le message de PDS

- **Emplacement de l'ATM** : la photo est rognée en carré, centrée sur la croix, sans le HUD de la carte et sans être redimensionnée.
- **Immatriculation** du véhicule de la session.
- **Agents** : tout le dispatch, écrit en texte d'après le surnom sur le serveur (format `[22] • Yvick Waler`), le motard suivi de 🏍️.
- **Mallettes** utilisées.
- **Date** prévue de la session.
- **Numéro** de l'ATM dans la journée (`01`, `02`, …) et un bouton **Session ATM** qui mène à l'annonce.

Le numéro repart à `01` chaque jour. Le jour pris en compte est la date prévue de la session : pour une session prévue à 23h, une PDS postée à 0h01 continue la numérotation de la veille.

### Le bouton ✏️

Permet au CO-ATM et à la Direction de **changer la photo** (l'ancienne est supprimée) et/ou le **nombre de mallettes**. Laisse le champ photo vide pour garder la photo actuelle. Il n'est utilisable que tant que la session est en cours.

---

## Les automatismes

| Moment | Ce que fait le bot |
| --- | --- |
| **30 min avant** l'heure prévue | Si la session n'est pas encore dispatchée : s'il y a assez d'agents disponibles, le CO-ATM est mentionné dans le salon CO-ATM pour qu'il fasse son dispatch ; sinon la session est **annulée** (manque d'agents) et un message, sans mention, l'indique dans le salon CO-ATM. Pas de vérification pour une session postée moins de 30 min avant son heure. |
| **15 min avant** | Si le dispatching est fait, tout le dispatch (CO-ATM compris) est mentionné dans le salon des sessions pour un rappel. Pas de rappel pour une session postée moins de 15 min avant son heure. |
| **30 min après** l'heure prévue | Si la session n'a pas commencé, le CO-ATM est mentionné dans le salon CO-ATM avec deux boutons (utilisables par le CO-ATM et la Direction) : **Maintenu** ou **Annuler**. |
| **10 min après « Maintenu »** | Si la session n'a toujours pas commencé, elle est annulée et les agents ayant voté « Je suis disponible » sont mentionnés dans le salon des sessions. |
| **10 min** après une demande de supervision | Sans réponse du superviseur, la demande est considérée comme refusée. |
| **5 h** après la création d'un brouillon | Le brouillon non envoyé est supprimé. |
| **1 h** après la perte du rôle CO ATM | Le superviseur est retiré de la liste, avec un message dans le salon des logs. |

---

## Où le bot écrit

| Salon | Messages |
| --- | --- |
| Salon des sessions ATM | Annonces de session, rappels 15 min avant, annulations faute de démarrage |
| Salon CO-ATM | Demandes de supervision, rappels de dispatching, annulations faute d'agents, question « session maintenue ? » |
| Salon des PDS ATM | Les PDS de chaque distributeur rempli |
| Salon des logs | Superviseurs retirés de la liste |

Toutes les autres réponses du bot (erreurs, confirmations, aperçu, panneau ⚙️) ne sont visibles que par la personne concernée.
