# BOBCAT — Guide d'utilisation du bot « Session ATM »

Le bot organise les sessions de ravitaillement d'ATM (distributeurs) : création et annonce de la session, inscription des agents, supervision, dispatching, suivi des PDS (distributeurs remplis), rappels et annulations automatiques.

---

## Vocabulaire

| Terme | Signification |
| --- | --- |
| **CO-ATM** | L'organisateur d'une session : la personne qui l'a créée avec `/atm`. Il la dirige. |
| **Rôle CO ATM** | Rôle Discord indiquant qu'un membre n'a plus besoin d'être supervisé. Ces membres peuvent être choisis comme superviseurs. |
| **Superviseur** | Membre ayant le rôle CO ATM qui accompagne un CO-ATM n'ayant pas encore ce rôle. |
| **Direction** | Membres ayant le rôle Direction : ils peuvent gérer toutes les sessions comme le CO-ATM. |
| **Dispatch** | Les personnes retenues pour la session : le CO-ATM, le superviseur, puis les agents choisis. |
| **U2R** | Unité 2 roues : agent pouvant suivre la session en moto (🏍️). |
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

Avant l'aperçu, le bot peut d'abord t'informer :

- si tu as des **sessions programmées** : il indique quand chacune sera postée (« dans X heures »), avec les boutons **🗑️ Déprogrammer** et **📨 Nouvelle session** ;
- si tu diriges déjà une session prévue aujourd'hui, ou si tu es sur le dispatch de l'une d'elles (en attente ou en cours) : il donne le lien vers cette session, avec le bouton **📨 Poster quand même**.

Si tu avais déjà commencé une session sans la poster, ton **brouillon est repris** là où tu l'avais laissé. Un brouillon non posté est supprimé 5 heures après sa création.

#### Étape 2 — Compléter l'aperçu

Dans l'aperçu, la liste des agents est remplacée par des boutons, et le bouton ⚙️ est grisé :

| Bouton | Ce qu'il fait |
| --- | --- |
| 🕑 **Choisir la date et l'heure** | À faire **en premier** : les autres boutons restent grisés tant que la date n'est pas choisie. |
| ℹ️ **Informations générales** | Tenue, fréquence radio, véhicule (et sa plaque si « Autre »). |
| 🛡️ **Sélectionner un superviseur** | Uniquement si tu **n'as pas** le rôle CO ATM (voir l'étape 3). |
| 🔔 **Ping les agents : Oui** / 🔕 **Non** | Choisit si les employés seront mentionnés à la publication. Oui par défaut ; un clic inverse le choix. |
| 📨 **Poster la session** | Poste (ou programme) la session. Il ne s'active que lorsque tout est rempli et, si besoin, que le superviseur a validé sa présence. |

L'aperçu se met à jour à chaque modification : ce que tu vois est exactement ce qui sera publié.

**Choisir la date et l'heure** ouvre un formulaire avec trois listes :

| Liste | Choix |
| --- | --- |
| Date | Aujourd'hui et les 6 jours suivants, ex : « Mardi 10/11/2026 (aujourd'hui) », « Mercredi 11/11/2026 (demain dans 3 heures) » |
| Heure | De 00 h à 23 h |
| Minutes | Par 5 minutes (00, 05, …, 55) |

Règles sur la date :

- la session doit être postée **au moins 10 minutes** avant son heure de début (à 7h00, 7h10 au plus tôt) ;
- une session dure environ **1h30** : tu ne peux pas en créer une qui chevauche une autre session sur laquelle tu es (en tant que CO-ATM, sur le dispatch ou après avoir voté « Je suis disponible »). Tu peux en prévoir une plus tard ;
- la même règle vaut pour le superviseur : il ne peut pas être sur deux sessions qui se chevauchent.

**Informations générales** :

| Champ | Choix |
| --- | --- |
| Choix de la tenue | CDF/ATM Long, CDF/ATM Court |
| Fréquence radio | Sierra 6, Sierra 7, Sierra 8 |
| Choix du véhicule | ZJR 325, ABC 123, Autre |
| Plaque du véhicule | Uniquement pour « Autre » : 8 caractères maximum, lettres, chiffres et espaces (pas uniquement des espaces) |

Une radio ou un véhicule déjà utilisé par une autre session (postée ou programmée, en attente ou en cours) à moins d'1h30 d'écart n'apparaît pas dans la liste. « Autre » reste toujours proposé, mais une plaque déjà utilisée à ce moment-là est refusée : choisis-en une autre. Si tu changes la date et que la radio ou le véhicule choisi est pris à la nouvelle heure, il est retiré de l'aperçu et tu dois en choisir un autre.

#### Étape 3 — La validation du superviseur (si tu n'as pas le rôle CO ATM)

1. Choisis la date, puis clique sur **Sélectionner un superviseur** et choisis-le dans la liste.
2. Une demande est envoyée dans le salon CO-ATM et le superviseur est mentionné. Il répond avec **✅ Je suis disponible** ou **❌ Pas disponible**. Lui seul peut répondre.
3. Pendant l'attente, les boutons date, informations et superviseur de ton aperçu sont grisés.
4. Selon la réponse :
   - **Disponible** : sa présence est validée et **Poster la session** s'active. Le superviseur ne peut plus être changé ; la date et les informations restent modifiables.
   - **Pas disponible**, ou **pas de réponse en 10 minutes** : la demande est refusée, choisis un autre superviseur.

Tu reçois un message à chaque réponse et ton aperçu se met à jour. Si ton aperçu a été ouvert il y a plus de 15 minutes, relance `/atm` pour le voir à jour.

Un superviseur déjà sur une session au même moment ne peut pas être choisi ni valider sa présence. S'il est placé sur une autre session au même moment avant que tu postes, sa présence est annulée et tu dois en choisir un autre.

#### Étape 4 — Poster la session

Clique sur **📨 Poster la session**. Le bot revérifie la date, la radio, le véhicule et le superviseur, puis :

- si la session commence **dans moins de 5 heures**, elle est publiée tout de suite dans le salon des sessions ATM (avec la mention des employés si le ping est sur Oui) ;
- si elle commence **dans plus de 5 heures**, elle est **programmée** : elle sera postée automatiquement **1h45 avant son début**.

### Les sessions programmées

- Une session programmée réserve déjà son créneau, sa radio et son véhicule.
- **30 minutes avant sa publication**, le CO-ATM reçoit un rappel dans le salon CO-ATM avec deux boutons : **✅ Je veux toujours la faire** et **🗑️ Déprogrammer**. Sans réponse, la session est postée quand même.
- **Déprogrammer** (depuis ce rappel ou depuis `/atm`) supprime la session : elle ne sera jamais postée.
- Une fois postée, le rappel est mis à jour avec le lien vers l'annonce.

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
| 🏍️ | U2R |
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
- Le bouton devient inutilisable une fois le dispatching fait, dès que la session commence, et quand elle est terminée ou annulée.

> Les personnes ajoutées au message après sa publication (par exemple via « Je suis disponible ») apparaissent en surbrillance, mais Discord ne leur envoie pas de notification.

---

## Le bouton ⚙️ : gérer sa session

Réservé au **CO-ATM** de la session et à la **Direction**. Il ouvre un panneau visible par toi seul, avec la date, le statut et le nombre d'ATM remplis aujourd'hui (et, pendant la session, sur la session).

Le bouton **🛑** en haut à droite **annule** la session avant son début et la **termine** pendant. Une confirmation est toujours demandée (**Oui** / **Retour**).

### Avant le début de la session

| Bouton | Ce qu'il fait |
| --- | --- |
| 🛑 (annuler) | Confirmation, puis formulaire de la raison (Manque d'effectif, CO-ATM indisponible, Superviseur indisponible, Véhicule indisponible, Autre). Avec « Autre », précise la raison, sinon l'annulation est refusée. La session passe en « Annulée ». |
| **Modifier les informations** | Radio, véhicule (et sa plaque si « Autre ») et tenue. Les radios et véhicules pris par une autre session au même moment ne sont pas proposés. |
| **Gestion du Dispatch** | Choisir les agents, ou remplacer des agents déjà dispatchés (voir ci-dessous). |
| **Commencer la session** | Possible au plus tôt **10 minutes avant l'heure prévue**, avec un nombre minimum de personnes sur le dispatch, CO-ATM et superviseur compris (3 par défaut : le CO-ATM + 2 agents, ou le CO-ATM + le superviseur + 1 agent). Le bot demande alors si **tous les agents du dispatch sont autour de la table** : la session ne commence qu'après « Oui, ils sont tous là ». |

#### Tuto : faire le dispatching

1. Clique sur **Gestion du Dispatch** : un formulaire liste les agents ayant voté « Je suis disponible », avec leurs habilitations : `Pseudo 🏍️ 🔫`, `Pseudo 🏍️`, `Pseudo 🔫` ou `Pseudo`.
2. Sélectionne les agents :
   - sans superviseur : de 1 à 4 agents (3 dans le véhicule, le 4e en U2R) ;
   - avec superviseur : de 1 à 3 agents (2 dans le véhicule, le 3e en U2R).

   L'agent en plus du véhicule part en moto : au moins un des agents sélectionnés doit être U2R.
3. Valide, puis clique sur **🚙 Choisir le conducteur** qui apparaît dans le panneau. Discord ne permet pas d'enchaîner deux formulaires, d'où ce bouton.
4. Sélectionne le **conducteur** et, si un agent part en moto, l'**U2R** (deux personnes différentes).
5. Le dispatch de l'annonce est mis à jour avec les logos 🚙 et 🏍️, et le bouton « Je suis disponible » devient inutilisable.

#### Tuto : remplacer des agents

Une fois le dispatching fait, **Gestion du Dispatch** sert à remplacer des agents :

1. Un formulaire affiche un champ par agent dispatché : écris la **raison du remplacement** pour ceux à remplacer, laisse vide pour garder les autres.
2. Clique sur **👥 Choisir les remplaçants** et choisis-les parmi les agents ayant voté (tu peux aussi n'en choisir aucun, ou ajouter des agents s'il reste de la place).
3. Clique sur **🚙 Choisir le conducteur** et refais le choix du conducteur et de l'U2R.

Les agents remplacés sont retirés de la session (dispatch et liste des disponibles) et la raison est conservée.

### Pendant la session

| Bouton | Ce qu'il fait |
| --- | --- |
| 🏧 **Nouvelle PDS** | Déclarer un distributeur rempli (voir ci-dessous). |
| 🛑 (terminer) | Confirmation, puis la session passe en « Terminée » : tous ses boutons sont désactivés, y compris les ✏️ de ses PDS. |

---

## Les PDS ATM

### Tuto : déclarer une PDS

1. Pendant la session, ouvre **⚙️** puis clique sur **🏧 Nouvelle PDS**.
2. Choisis le **nombre de mallettes** utilisées (de 1 à 5).
3. Ajoute la **photo de l'emplacement de l'ATM** : une capture **plein écran** de la carte, avec la croix du curseur sur le distributeur.
4. Valide : la PDS est publiée dans le salon des PDS ATM, et le panneau affiche « PDS n°01 posté : lien » (numéro de l'ATM sur la session).

Une PDS n'est possible que pendant une session en cours.

### Le message de PDS

- **Emplacement de l'ATM** : la photo est rognée en carré, centrée sur la croix, sans le HUD de la carte et sans être redimensionnée.
- **Immatriculation** du véhicule de la session.
- **Agents** : tout le dispatch, écrit en texte d'après le surnom sur le serveur (format `[22] • Yvick Waler`), l'U2R suivi de 🏍️.
- **Mallettes** utilisées.
- **Date** prévue de la session.
- **Numéro** de l'ATM dans la journée (`01`, `02`, …) et un bouton **Session ATM** qui mène à l'annonce.

Le numéro repart à `01` chaque jour. Le jour pris en compte est la date prévue de la session : pour une session prévue à 23h, une PDS postée à 0h01 continue la numérotation de la veille.

### Le bouton ✏️

Permet au CO-ATM et à la Direction de **changer la photo** (l'ancienne est supprimée) et/ou le **nombre de mallettes**. Laisse le champ photo vide pour garder la photo actuelle. Il n'est utilisable que tant que la session est en cours.

### Supprimer une PDS

Clic droit sur le message de la PDS → **Applications** → **Supprimer la PDS**. Après confirmation, la PDS, sa photo et son message sont supprimés définitivement. Réservé au CO-ATM de la session et à la Direction, même après la fin de la session. Les numéros des autres PDS ne changent pas, et la PDS suivante prend le numéro après le plus grand.

---

## Les automatismes

| Moment | Ce que fait le bot |
| --- | --- |
| **30 min avant la publication** d'une session programmée | Rappel au CO-ATM dans le salon CO-ATM (**Je veux toujours la faire** / **Déprogrammer**). |
| **1h45 avant** une session programmée | Publication automatique de la session. |
| **30 min avant** l'heure prévue | Si la session n'est pas encore dispatchée : s'il y a assez d'agents disponibles, le CO-ATM est mentionné dans le salon CO-ATM pour qu'il fasse son dispatch ; sinon la session est **annulée** (manque d'agents) et un message, sans mention, l'indique dans le salon CO-ATM. Pas de vérification pour une session postée moins de 30 min avant son heure. |
| **15 min avant** | Si le dispatching est fait, tout le dispatch (CO-ATM compris) est mentionné dans le salon RECHERCHE ATM pour un rappel. Pas de rappel pour une session postée moins de 15 min avant son heure. |
| **30 min après** l'heure prévue | Si la session n'a pas commencé, le CO-ATM est mentionné dans le salon CO-ATM avec deux boutons (utilisables par le CO-ATM et la Direction) : **Maintenu** ou **Annuler**. |
| **10 min après « Maintenu »** | Si la session n'a toujours pas commencé, elle est annulée et les agents ayant voté « Je suis disponible » sont mentionnés dans le salon RECHERCHE ATM. |
| **10 min** après une demande de supervision | Sans réponse du superviseur, la demande est considérée comme refusée. |
| **5 h** après la création d'un brouillon | Le brouillon non posté est supprimé. |
| **1 h** après la perte du rôle CO ATM | Le superviseur est retiré de la liste, avec un message dans le salon des logs. |

Les rappels et messages d'annulation ont un bouton **Voir la session** qui mène à l'annonce.

---

## Où le bot écrit

| Salon | Messages |
| --- | --- |
| Salon des sessions ATM | Annonces de session |
| Salon RECHERCHE ATM | Rappels 15 min avant, annulations faute de démarrage (avec mention des agents qui avaient voté) |
| Salon CO-ATM | Demandes de supervision, rappels des sessions programmées, rappels de dispatching, annulations faute d'agents, question « session maintenue ? » |
| Salon des PDS ATM | Les PDS de chaque distributeur rempli |
| Salon des logs | Superviseurs retirés de la liste |

Toutes les autres réponses du bot (erreurs, confirmations, aperçu, panneau ⚙️) ne sont visibles que par la personne concernée.

---

## Historique

- Les sessions annulées ou terminées sont archivées dans une corbeille : leurs boutons restent désactivés et répondent « session clôturée ».
- Toutes les actions sont enregistrées, avec la date et l'heure, dans la console du bot : commandes, menus contextuels, boutons, formulaires, publications, rappels, annulations, PDS, ajouts et suppressions en base de données et sur Cloudinary.
