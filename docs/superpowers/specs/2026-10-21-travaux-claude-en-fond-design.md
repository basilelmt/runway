# Travaux de Claude en fond

## Objectif

Les travaux longs de Claude continuent quand on ferme l'écran qui les a lancés, et un petit panneau en bas de l'écran dit, depuis n'importe quelle page, ce qui tourne et ce qui vient de finir.

Travaux suivis :

- la recherche web d'un marchand (jusqu'à 2 min), lancée depuis la fiche d'une opération ;
- la fournée d'idées d'Investir (6 à 8 min) ;
- le nommage et la description des marchands en tâche de fond.

## Hors périmètre

- Le tri des opérations à ranger avec Claude (ses propositions vivent dans l'écran ; il faudrait les garder côté serveur).
- Demander, qui a déjà son propre panneau.
- Un historique des travaux au-delà de 10 minutes.
- Une poussée serveur (SSE, WebSocket) : l'interrogation régulière suffit.

## Serveur

### Registre en mémoire

`server/src/services/claude-tasks.ts` exporte `createClaudeTasks({ now })` qui renvoie :

- `start(kind, label, subject?)` → `id` (texte unique) ;
- `finish(id, { result?: string })` et `fail(id, error: string)` ;
- `list()` → les travaux en cours et ceux finis depuis moins de 10 minutes, les plus récents d'abord, 20 au plus.

Types partagés (`shared/api-types.ts`) :

```ts
export type ClaudeTaskKind = 'merchant_web' | 'merchant_naming' | 'ideas';
export type ClaudeTaskView = {
  id: string;
  kind: ClaudeTaskKind;
  label: string;
  /** Clé du marchand pour `merchant_web`, sinon null. */
  subject: string | null;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  /** Phrase courte montrée à la fin : la description trouvée, le nombre d'idées. */
  result: string | null;
  error: string | null;
};
```

Un seul registre par processus, créé dans `createApp` (ou passé en option pour les tests), comme le nommeur de marchands.

### Recherche web

`POST /api/merchants/:key/describe` ne fait plus attendre : il vérifie le marchand (404, 409 comme aujourd'hui), lance la recherche en tâche de fond et répond 202 avec le `ClaudeTaskView` en cours.
Une recherche déjà en cours pour la même clé est réutilisée : même tâche, pas de second appel à Claude.
À la fin : `finish` avec la description trouvée, ou « Rien trouvé sur le web » ; une erreur Claude donne `fail` avec son message.
Libellé : « Claude cherche <nom du marchand> sur le web ».

### Nommage des marchands

`createMerchantNamer` reçoit le registre ; chaque exécution qui a au moins une clé à traiter ouvre une tâche « Claude décrit tes marchands », finie avec « <n> marchands nommés ou décrits », ou en échec avec l'erreur.
Une exécution sans rien à traiter n'ouvre pas de tâche (le nommeur tourne à chaque import, synchro et démarrage).

### Fournée d'idées

Les fournées sont déjà en base (`idea_runs`) : `list()` n'en garde pas de copie.
La route des tâches ajoute la fournée en cours et celles finies depuis moins de 10 minutes, lues dans la table, avec l'id `ideas-<id>`.
Libellé « Claude cherche des idées d'investissement » ; résultat « <n> idées retenues » ou l'erreur de la fournée.

### Route

`GET /api/claude/tasks` → `ClaudeTaskView[]`, fusion du registre et des fournées, triée par `startedAt` décroissant.

## Client

### Données

`useClaudeTasks()` dans `client/src/api/hooks.ts` : interroge `/api/claude/tasks` toutes les 2 s tant qu'une tâche tourne, toutes les 30 s sinon.
Lancer une recherche web invalide la requête pour que la tâche apparaisse aussitôt.

Un composant sans rendu, monté dans `Shell`, repère les tâches qui passent de `running` à `done` ou `failed` et invalide :

- `merchant_web` : le détail du marchand (`['merchants']`) ;
- `merchant_naming` : `['transactions']`, `['transaction']`, `['merchants']` ;
- `ideas` : les requêtes d'Investir (`['invest']` ou les clés existantes des idées).

Il remplace `useMerchantNamingSync`, qui disparaît.

### Panneau

`ClaudeTasksTray` (`client/src/components/layout/`), monté dans `Shell`, empile une carte par tâche en bas à droite :

- en cours : icône animée (la même que les autres attentes de Claude), libellé ;
- finie : coche, libellé de fin (`result`), lien « Voir » vers `/investir` pour une fournée ; disparaît seule après 10 s ou par son bouton de fermeture ;
- en échec : icône d'alerte, `error`, reste jusqu'à fermeture.

Le panneau ne montre une tâche finie que s'il l'a vue en cours dans cet onglet : un rechargement ne fait pas réapparaître de vieilles notifications.
Position : bas droite, décalé à gauche quand Demander est ouvert ; sur mobile, au-dessus de la barre de navigation, pleine largeur moins les marges.
Il ne recouvre pas les toasts (bas centre).
Région `role="status"` et `aria-live="polite"` pour les lecteurs d'écran.

### Fiche

`MerchantAbout` affiche « Claude cherche sur le web… » quand une tâche `merchant_web` en cours porte sa clé, y compris à la réouverture de la fiche ; le bouton reste désactivé pendant ce temps.
Le résultat arrive par l'invalidation du détail du marchand.

## Tests

- Registre : début, fin, échec, purge après 10 minutes, limite de 20.
- Recherche web : réponse 202 immédiate avec la tâche, description écrite à la fin, réutilisation d'une recherche en cours, échec Claude reporté sur la tâche, 404 et 409 inchangés.
- Nommeur : une tâche par exécution utile, aucune sans clé à traiter, échec reporté.
- Route : fusion avec les fournées en cours et récentes.
- Client : panneau (en cours, fini, échec, disparition, rien après rechargement), invalidations à la fin, fiche qui retrouve la recherche en cours.
- Recette dans le navigateur : lancer une recherche web, fermer la fiche, voir la notification arriver et la description à la réouverture.
