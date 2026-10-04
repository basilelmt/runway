# Synchronisation bancaire - design

Runway importe aujourd'hui les relevés CSV et PDF de La Banque Postale à la main, une fois par mois.
Cette évolution ajoute une source automatique : l'API d'agrégation Enable Banking (DSP2), en mode « Restricted Production », gratuit pour les comptes que l'utilisateur lie lui-même.
Les opérations récupérées passent par le même traitement que les fichiers (empreintes, doublons, virements internes, rapprochement des prévues, règles de tri) puis sont enregistrées sans validation manuelle.

## Décisions prises

- Fournisseur : Enable Banking, application en environnement Production, tier « Restricted Production ».
  L'API directe de La Banque Postale est réservée aux prestataires agréés, les autres agrégateurs sont payants ou fermés aux nouveaux comptes.
- Retour après authentification : Runway tourne en HTTP sur localhost, or Enable Banking impose une URL de redirection HTTPS en production.
  L'application est déclarée avec `https://localhost:3000/bank-sync/callback`.
  Le navigateur ne charge pas cette page, mais l'URL complète (avec `code` et `state`) est dans la barre d'adresse : l'utilisateur la colle dans Runway.
  Cette manipulation n'a lieu qu'à la connexion et à chaque renouvellement du consentement (tous les 90 à 180 jours).
- Intégration automatique : les opérations synchronisées sont enregistrées directement, sans écran de validation.
  Ce qui n'est pas classé par une règle de tri atterrit dans « À trier », comme aujourd'hui.
- Cadence : synchronisation à l'ouverture de l'app si la dernière date de plus d'une heure, plus un bouton « Synchroniser maintenant ».
  Pas de tâche de fond quand l'app est fermée.
- Jonction avec l'historique PDF : pour chaque compte, la première synchronisation part du lendemain de la dernière opération confirmée issue d'un import (à défaut, de la dernière opération confirmée).
  Les saisies manuelles et les récurrences confirmées ne repoussent pas cette date : elles ne prouvent pas que l'historique bancaire est complet.
  Jusqu'à 10 jours après la liaison, une opération de même date et même montant qu'une opération existante du compte est traitée comme doublon.
- Opérations en attente (non comptabilisées) : ignorées.
  Seules les opérations au statut `BOOK` sont récupérées.
- Secrets : l'Application ID et la clé privée sont saisis dans Paramètres et stockés dans la table `settings`.
  Cohérent avec le projet (local, mono-utilisateur, sans chiffrement), et aucune variable d'environnement à câbler.
- Signature JWT : RS256 via `node:crypto`, aucune dépendance ajoutée.
- Architecture : le pipeline d'import existant est généralisé pour accepter une source « fichier » ou une source « API ».
  Une seule logique métier, testée une fois.

## Hors périmètre

- Opérations en attente de comptabilisation.
- Vérification du solde annoncé par la banque.
- Synchronisation en tâche de fond serveur.
- Autres banques qu'Enable Banking ne couvrirait pas : le code est générique sur le fournisseur, mais seule La Banque Postale est proposée dans l'UI.

## Rappels sur l'API Enable Banking

Base : `https://api.enablebanking.com`.
Authentification : en-tête `Authorization: Bearer <jwt>`, JWT RS256 signé avec la clé privée de l'application, en-tête `kid` = Application ID, claims `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat`, `exp = iat + 3600`.

| Appel | Usage |
|---|---|
| `GET /application` | Vérifier la clé et l'Application ID (bouton « Tester »). |
| `GET /aspsps?country=FR` | Lire `maximum_consent_validity` de La Banque Postale. |
| `POST /auth` | Démarrer l'autorisation : `aspsp {name, country}`, `psu_type: "personal"`, `access.valid_until`, `redirect_url`, `state`. Renvoie `url`. |
| `POST /sessions` | Échanger `code` contre `session_id` et la liste `accounts[] {uid, account_id.iban, name, product, currency}`. |
| `GET /sessions/{id}` | Statut `AUTHORIZED` / `PENDING` / `REJECTED`, `access.valid_until`. |
| `GET /accounts/{uid}/transactions` | Paramètres `date_from`, `date_to`, `transaction_status=BOOK`, `continuation_key`. |
| `DELETE /sessions/{id}` | Révoquer le consentement (bouton « Déconnecter »). |

Les en-têtes `Psu-Ip-Address` et `Psu-User-Agent` sont envoyés sur chaque lecture : l'utilisateur est devant l'app, l'appel ne consomme pas le quota DSP2 des quatre accès quotidiens sans présence.

Champs d'une opération utilisés : `entry_reference`, `booking_date`, `value_date`, `transaction_amount {amount, currency}`, `credit_debit_indicator` (`CRDT` / `DBIT`), `status`, `remittance_information[]`, `creditor.name`, `debtor.name`, `bank_transaction_code`.

## Modèle de données

### `bank_connections`

Une connexion = un consentement auprès d'une banque, couvrant plusieurs comptes.

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| provider | text | `enablebanking` |
| aspsp_name | text | `La Banque Postale` |
| aspsp_country | text | `FR` |
| state | text | jeton aléatoire envoyé à `/auth`, vérifié au retour |
| session_id | text nullable | null tant que l'autorisation n'est pas terminée |
| status | `pending` / `authorized` / `active` / `expired` / `revoked` | `pending` : autorisation lancée ; `authorized` : session créée, liaisons à confirmer ; `active` : synchronisable |
| valid_until | text nullable | fin du consentement, ISO datetime |
| last_sync_at | text nullable | ISO datetime |
| last_error | text nullable | message de la dernière synchro en échec, effacé au prochain succès |
| created_at | text | |

### `bank_accounts`

Un compte renvoyé par l'API, lié ou non à un compte Runway.

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| connection_id | integer | FK `bank_connections`, cascade |
| uid | text | identifiant Enable Banking du compte |
| iban | text nullable | |
| bank_name | text | libellé renvoyé par la banque (`name` ou `product`) |
| account_id | integer nullable | FK `accounts` ; null = ignoré |
| sync_from | text nullable | date de départ ISO, fixée au moment de la liaison |
| linked_at | text nullable | jour de la liaison ISO ; borne la fenêtre de jonction ; null si le compte est ignoré |
| last_synced_date | text nullable | `booking_date` la plus récente enregistrée |

### `settings`

Deux clés ajoutées : `enableBankingAppId` (chaîne, vide par défaut) et `enableBankingPrivateKey` (PEM, vide par défaut).
L'export JSON de sauvegarde masque la clé privée (chaîne vide) : l'utilisateur conserve le fichier `.pem`.

### `imports`

Pas de changement de schéma.
Chaque synchro qui enregistre au moins une opération crée une ligne par compte, `file_name` = `Synchronisation La Banque Postale`, pour apparaître dans l'historique existant.

## Architecture serveur

### Généralisation du pipeline d'import

`server/src/services/import.ts` est découpé en deux étapes :

1. Lecture : `readFileSource(db, buffer, accountId, section)` (code actuel) ou construction directe d'une `Source` par la synchro.
2. Traitement : `buildPreview(db, source, accountId)` produit les `ImportPreviewRow` (empreintes, doublons, virements internes, crédits internes, rapprochement des prévues, règles de tri).

Le type `Source` évolue : les sections PDF (`pdfSections`) deviennent des `siblings: { accountId, iban, rows }[]`, c'est-à-dire les autres comptes lus dans le même lot.
La détection des virements internes travaille sur `siblings`, qu'ils viennent d'un PDF multi-comptes ou d'une synchro multi-comptes.
Quand le libellé cite un IBAN, il désigne la cible (cas des relevés PDF) ; sans aucun IBAN dans le libellé (cas de l'API), un unique compte frère portant la contrepartie (même montant, ±4 jours) suffit.
`previewImport` (route fichier) et `commitImport` gardent leur signature.

### Module `server/src/bank/`

- `enable-banking.ts` : client HTTP typé.
  Interface `BankProvider` avec `getApplication`, `getAspsp`, `startAuth`, `createSession`, `getSession`, `listTransactions` (gère la pagination), `deleteSession`.
  Implémentation `EnableBankingClient` sur `fetch`, construite avec `{ appId, privateKey, psu: { ip, userAgent } }`.
  Erreurs HTTP converties en `BankProviderError { status, code, message }`.
- `jwt.ts` : `signJwt(appId, privateKeyPem, now)`, fonction pure.
- `mapping.ts` : `toSourceRow(tx)` convertit une opération Enable Banking en `SourceRow`.
  Date = `booking_date` (repli sur `value_date`).
  Montant signé en centimes : `transaction_amount.amount` × signe selon `credit_debit_indicator`.
  Libellé = `remittance_information` jointe par un espace, repli sur `creditor.name` (débit) ou `debtor.name` (crédit), repli final sur `bank_transaction_code`.
  Note = libellé complet suivi des champs annexes non vides (contrepartie, référence, date de valeur).
  Les opérations dont le statut n'est pas `BOOK` sont rejetées en amont.

### Service `server/src/services/bank-sync.ts`

- `startConnection(db, provider, { connectionId?, now })` : lit `maximum_consent_validity` (90 jours par défaut), appelle `/auth`, supprime les connexions `pending` abandonnées puis crée la ligne `pending` (ou, pour un renouvellement, régénère `state` sur la connexion existante sans toucher à ses `bank_accounts`), renvoie `{ connectionId, url }`.
- `completeConnection(db, provider, { connectionId, code, state })` : vérifie `state`, crée la session, enregistre les `bank_accounts`.
  Un compte déjà connu de la connexion (même IBAN, sinon même `uid`) garde sa liaison et ses dates, seul `uid` est rafraîchi.
  Pour un compte nouveau, propose un `account_id` quand les caractères 15 à 25 de l'IBAN (numéro de compte français) égalent `accounts.bank_account_number`.
  Renseigne `valid_until`, puis passe la connexion en `authorized` (première connexion, liaisons à confirmer) ou directement en `active` (renouvellement, liaisons déjà connues).
- `linkAccounts(db, { connectionId, links: { bankAccountId, accountId | null }[], today })` : enregistre les liaisons, fixe `sync_from` = lendemain de la dernière opération confirmée importée du compte Runway (`import_id` non nul), sinon de la dernière opération confirmée, sinon aujourd'hui moins 90 jours, fixe `linked_at` = aujourd'hui et passe une connexion `authorized` en `active`.
  Un compte ignoré (`accountId` null) garde `sync_from` et `linked_at` null et n'est jamais synchronisé.
  `getState` expose la même date de départ pour chaque compte Runway non archivé (`syncStartByAccount`), affichée sous chaque sélecteur avant la liaison.
- `runSync(db, provider, { onlyIfStaleMinutes?, today })` :
  1. Verrou en mémoire : si une synchro est en cours, renvoie son résultat à venir plutôt que d'en lancer une seconde.
  2. Si `onlyIfStaleMinutes` est fourni et que `last_sync_at` est plus récent, ne fait rien.
  3. Pour chaque connexion `active` : vérifie `GET /sessions/{id}` ; statut autre que `AUTHORIZED` ou `valid_until` dépassé → statut `expired`, on passe à la suivante.
  4. Pour chaque `bank_accounts` lié à un compte Runway non archivé : `date_from` = max(`sync_from`, `last_synced_date` moins 7 jours), `date_to` = aujourd'hui, statut `BOOK`, toutes les pages.
  5. Construit une `Source` par compte avec les autres comptes du lot en `siblings`, appelle `buildPreview`, puis applique la déduplication de jonction : une ligne `new` datée au plus tard 10 jours après `linked_at` et qui a une opération confirmée existante de même compte, même date et même montant signé devient `duplicate`.
     Les opérations antérieures à `sync_from` ne sont jamais demandées.
  6. Une fois toutes les prévisualisations construites, et avant toute écriture, `markClaimedCounterparts` marque `internal` le crédit qui sert de contrepartie à chaque ligne `transfer` d'un autre compte du lot (même montant opposé, ±4 jours, chaque crédit une seule fois), quel que soit l'ordre des comptes.
  7. Appelle `commitImport` avec les lignes `new`, `matched` et `transfer` ; met à jour `last_synced_date`.
  8. Met à jour `last_sync_at`, efface ou renseigne `last_error`.
  Renvoie un résumé `{ reason: 'ok' | 'fresh' | 'not_configured' | 'no_connection', connections: { connectionId, status, created, matched, duplicates, skipped, error }[] }`.
- `disconnect(db, provider, connectionId)` : `DELETE /sessions/{id}` (erreur ignorée si déjà expirée), statut `revoked`, les `bank_accounts` restent pour l'historique.

Le fournisseur est injecté dans `createApp` via `bankDeps: { provider?: (settings, psu) => BankProvider }`, comme `importDeps` et `exec`.
En test, un faux `BankProvider` en mémoire.

### Routes `server/src/routes/bank-sync.ts`

| Méthode et chemin | Rôle |
|---|---|
| `GET /api/bank-sync` | État : identifiants configurés ou non, URL de redirection, connexions (hors `pending`), comptes liés, dernière synchro, erreurs, expiration. |
| `POST /api/bank-sync/test` | Vérifie les identifiants (`GET /application`). |
| `POST /api/bank-sync/connections` | Démarre une autorisation, renvoie l'URL à ouvrir. |
| `POST /api/bank-sync/connections/:id/complete` | Corps `{ code, state }`, renvoie les comptes découverts avec la liaison proposée. |
| `PUT /api/bank-sync/connections/:id/accounts` | Enregistre les liaisons. |
| `POST /api/bank-sync/run` | Corps `{ onlyIfStaleMinutes? }`, lance la synchro, renvoie le résumé. |
| `DELETE /api/bank-sync/connections/:id` | Déconnecte. |

Hors `GET /api/bank-sync` et `POST /api/bank-sync/run` (qui répond `{ reason: 'not_configured' }`), toutes les routes répondent 400 avec un message explicite si les identifiants ne sont pas configurés.
Une erreur renvoyée par Enable Banking devient une 502 avec son message.

## Interface

### Paramètres

Nouvelle section « Banque (Enable Banking) » : champ Application ID, zone de texte pour la clé privée PEM, bouton « Tester la connexion ».
Le résultat du test s'affiche en ligne (nom de l'application ou message d'erreur).
Un lien vers le portail Enable Banking et un rappel de l'URL de redirection à déclarer.

### Import

Nouvelle carte « Synchronisation bancaire » au-dessus de la zone de dépôt, trois états :

1. Aucune connexion : texte court et bouton « Connecter La Banque Postale ».
   Si les identifiants ne sont pas configurés, le bouton renvoie vers Paramètres.
2. Autorisation en cours : l'URL LBP est ouverte dans un nouvel onglet, la carte affiche un champ « Colle ici l'URL de la page de retour » et un bouton « Valider ».
   Après validation, la liste des comptes découverts avec un sélecteur de compte Runway par ligne (pré-rempli) et l'option « Ignorer », puis « Terminer » qui enregistre et lance la première synchro.
3. Connexion active : dernière synchronisation (date et heure relatives), comptes liés, bouton « Synchroniser maintenant », lien « Déconnecter ».
   Si une erreur est stockée, elle s'affiche sous la ligne.
   Si le consentement expire dans moins de 15 jours, un avertissement avec bouton « Renouveler » (relance l'autorisation, remplace la session sur la même connexion).
   Si la connexion est `expired`, la carte le dit clairement avec le même bouton.

### Déclenchement à l'ouverture

Au montage du layout principal, le client appelle `POST /api/bank-sync/run` avec `onlyIfStaleMinutes: 60`.
Si la réponse contient des créations, les requêtes `transactions`, `overview`, `imports` et `bank-sync` sont invalidées et un toast résume (« 7 opérations synchronisées, 2 rapprochées »).
Aucun toast si rien de nouveau ou si la synchro est sautée.
Les erreurs ne font pas de toast au démarrage, elles restent visibles dans la carte.

## Gestion des erreurs

- Identifiants absents ou JWT refusé (401) : message dans Paramètres, aucune synchro tentée.
- Session `REJECTED` ou `valid_until` dépassé : connexion `expired`, pas d'exception.
- 429 ou erreur réseau : `last_error` renseigné, les autres connexions continuent, synchro manuelle → toast d'erreur.
- `state` inattendu au retour : 400 « Retour d'autorisation invalide, relance la connexion ».
- Opération API sans date ou sans montant : ligne ignorée et comptée dans le résumé, le reste du lot est traité.
- Compte Runway archivé entre deux synchros : la liaison est ignorée, signalé dans la carte.

## Tests

- `core` et fonctions pures : `signJwt` (structure, `kid`, `exp`), `toSourceRow` (signe, centimes, libellé, replis), déduplication de jonction.
- `server/test/bank-sync.test.ts` : faux `BankProvider`, base en mémoire.
  Scénarios : connexion complète avec proposition de liaison par IBAN, première synchro avec `sync_from`, chevauchement de 7 jours sans doublon, virement entre deux comptes synchronisés reconnu comme transfert, rapprochement d'une opération prévue, règle de tri appliquée, session expirée, erreur réseau isolée à une connexion, verrou contre deux exécutions concurrentes, `onlyIfStaleMinutes` respecté.
- `server/test/import.test.ts` et `import-pdf.test.ts` : inchangés dans leurs attentes, ils valident que la généralisation du pipeline ne casse rien.
- Routes : 400 sans identifiants, `state` invalide, résumé de synchro.

## Mise en route

1. Créer un compte sur https://enablebanking.com/sign-in/ puis une application Production dans https://enablebanking.com/cp/ avec l'URL de redirection `https://localhost:3000/bank-sync/callback`.
   Conserver le fichier `.pem` téléchargé et l'Application ID.
2. Dans l'application Enable Banking, « Link accounts » pour lier les comptes La Banque Postale (mode Restricted Production).
3. Dans Runway, Paramètres → Banque : saisir l'Application ID et la clé, tester.
4. Import → Connecter La Banque Postale, suivre les étapes.
