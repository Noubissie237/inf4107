# INF4107 – Plateforme de consultation des notes : frontend

> Ce fichier est la référence complète du frontend. Place-le à la racine du dépôt sous le nom `FRONTEND_SPEC.md`, à côté du `CLAUDE.md` du backend, puis ajoute une ligne dans `CLAUDE.md` : « Le frontend est décrit dans FRONTEND_SPEC.md ».

## 0. Règles de travail

- Lis tout ce fichier, ainsi que `CLAUDE.md` et `README.md` (le backend existe déjà et fonctionne), avant d'écrire du code.
- Travaille **étape par étape** (section 11). À la fin de chaque étape : lance les commandes de validation, résume en quelques lignes ce qui a été fait, puis **arrête-toi** et attends le feu vert de l'utilisateur.
- Reste **simple** : pas de bibliothèque, d'abstraction ni de fonctionnalité qui ne soit pas demandée ici. C'est un support de TP.
- Pour tout détail non précisé, décide toi-même et note la décision dans une section « Frontend : décisions » du `README.md`.
- Code, noms de variables et commentaires en **anglais**. Tous les textes affichés à l'utilisateur et le `README.md` en **français**.
- Ne modifie pas le backend, sauf `docker-compose.yml`, `docker/nginx/default.conf`, `Makefile`, `.env.example` et `README.md` (section 9). Si tu penses qu'un changement du backend est nécessaire, signale-le sans le faire.

## 1. Contexte

Le backend (deux microservices FastAPI derrière une passerelle Nginx) est terminé. Chaque étudiant du TP déploie l'application complète sur `https://<matricule>.inf4107.site`. Le frontend est donc, comme le backend, un composant que les étudiants devront héberger : **il doit être facile à déployer de plusieurs façons** (stockage statique avec CDN, conteneur, PaaS).

Parcours utilisateur :

1. Le visiteur arrive sur une **page d'accueil publique** simple, avec un bouton « Connexion » en haut de la page.
2. Il se connecte avec son matricule et son mot de passe.
3. Il consulte ses **notes de CC, de TP et de SN pour chaque matière**, avec la moyenne de chaque matière.
4. Il peut **définir ou changer sa photo de profil**.

### Contrat de l'API (déjà implémentée, ne pas la modifier)

Toutes les routes passent par la passerelle (même origine que le frontend). Le jeton se passe dans `Authorization: Bearer <jwt>`.

| Méthode | Route | Jeton | Rôle |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | non | Corps `{"matricule","password"}`. 200 : `{"access_token","token_type":"bearer","expires_in":3600}`. 401 : `{"detail":"Matricule ou mot de passe incorrect"}`. 422 si le matricule est mal formé |
| GET | `/api/auth/me` | oui | 200 : `{"matricule","full_name","photo_url"}`. 401 : `{"detail":"Non authentifié"}` |
| PUT | `/api/auth/me/photo` | oui | `multipart/form-data`, champ `file`. Renvoie la même réponse que `/me`. 413 trop volumineux, 415 format non supporté, 422 dimensions excessives (messages dans `detail`, en français) |
| GET | `/api/auth/me/photo` | oui | Octets de l'image (mode `local` uniquement) |
| GET | `/api/grades/me/grades?semester=S1` | oui | Voir ci-dessous |

Réponse des notes :

```json
{
  "matricule": "20u2671",
  "semester": "S1",
  "courses": [
    {"code": "INF4101", "title": "Génie logiciel avancé", "credits": 4,
     "cc": 14.5, "tp": null, "sn": 12.0, "average": null}
  ]
}
```

- `cc`, `tp`, `sn` sont des nombres sur 20 ou `null` (note absente). `average` est `null` tant que les trois notes ne sont pas toutes présentes.
- Un semestre sans note renvoie `"courses": []` avec un statut 200.

**`photo_url`** vaut :

- `null` : pas de photo, afficher les initiales ;
- un chemin relatif (`/api/auth/me/photo`) : mode `local`, la route exige l'en-tête `Authorization`, donc il faut **récupérer l'image avec `fetch`** (avec l'en-tête), la convertir en blob puis en `URL.createObjectURL` ;
- une **URL absolue `https://…`** : mode `s3`, URL signée valable 15 minutes, utilisable directement dans une balise `<img>`.

## 2. Contraintes de déployabilité (non négociables)

1. **Export statique** : `output: 'export'` dans `next.config`. Aucun rendu côté serveur, aucune API route, aucun middleware, aucune server action, aucune fonctionnalité Next.js qui exige un serveur Node. `images: { unoptimized: true }` et `trailingSlash: true` (les pages sont servies sous `/connexion/`, `/notes/`, `/profil/`, ce qui facilite l'hébergement statique).
2. **Aucune variable d'environnement figée à la construction** (pas de `NEXT_PUBLIC_*` en production). L'adresse des services se lit à l'exécution dans `/config.json` (section 3).
3. **Aucune requête vers un tiers** : pas de polices Google, de CDN, de statistiques ni de scripts externes. Utilise la pile de polices système.
4. Le résultat de la construction (`out/`) doit pouvoir être **déposé tel quel** sur n'importe quel hébergement statique, ou servi par le conteneur fourni.
5. L'image Docker est **légère et non-root**.
6. L'application ne doit pas être indexée par les moteurs de recherche (c'est une plateforme fictive publiée sur Internet) : `<meta name="robots" content="noindex, nofollow">` et `public/robots.txt` avec `Disallow: /`.
7. **Plateforme clairement fictive** : n'utilise ni le nom, ni le logo, ni l'identité visuelle d'une vraie université. Le nom affiché est « Portail des résultats ». Un texte visible sur **toutes les pages**, en pied de page, indique : « Plateforme fictive utilisée pour le TP INF4107. Toutes les données sont des données de démonstration. » Le titre du document contient « (démo) ».

## 3. Configuration à l'exécution (`/config.json`)

Fichier `public/config.json`, copié dans `out/` :

```json
{ "authApiUrl": "/api/auth", "gradesApiUrl": "/api/grades" }
```

- Les valeurs par défaut sont des **chemins relatifs** : tout fonctionne quand le frontend et l'API sont servis sous la même adresse (passerelle, CloudFront avec plusieurs origines, load balancer).
- Elles peuvent être des **URL absolues** (par exemple `https://api.20u2671.inf4107.site/api/auth`) quand l'API est sur un autre nom de domaine. C'est un choix des étudiants.
- `lib/config.ts` charge ce fichier **une fois** au démarrage (`fetch('/config.json', { cache: 'no-store' })`), retombe sur les valeurs par défaut s'il est absent ou invalide, et expose `getConfig()`.
- Fonction `resolveApiUrl(path)` : un chemin relatif renvoyé par l'API (par exemple le `photo_url` `/api/auth/me/photo`) est résolu sur **l'origine de `authApiUrl` si elle est absolue**, sinon laissé tel quel (même origine).
- **Mode développement uniquement** : quand `process.env.NODE_ENV === 'development'` et que `NEXT_PUBLIC_DEV_GATEWAY` est défini (fichier `frontend/.env.development` avec `http://localhost:8080`), les chemins relatifs sont préfixés par cette valeur, pour que `npm run dev` (port 3000) parle à la passerelle Docker. Cette branche n'existe pas dans le build de production. Le backend autorise déjà `http://localhost:3000` dans `CORS_ORIGINS`.
- Dans le conteneur, un script d'entrée **réécrit `config.json` au démarrage** à partir des variables `AUTH_API_URL` et `GRADES_API_URL` si elles sont définies (valeurs par défaut `/api/auth` et `/api/grades`), pour changer d'architecture sans reconstruire l'image.

## 4. Stack

- **Next.js** (dernière version stable, App Router), **TypeScript en mode strict**, React.
- **Tailwind CSS**. Pas de bibliothèque de composants. Les couleurs, espacements et rayons sont définis une seule fois comme variables CSS ou dans le thème Tailwind.
- **npm** comme gestionnaire de paquets, versions figées par `package-lock.json`.
- Tests : **Vitest** et **React Testing Library**. ESLint avec la configuration Next.js.
- Aucune autre dépendance sans raison solide (pas de bibliothèque d'état, de formulaires, de requêtes ni d'icônes : quelques SVG en ligne suffisent).

## 5. Arborescence cible

```
frontend/
├── Dockerfile
├── .dockerignore
├── docker/
│   ├── nginx.conf               # serveur statique du conteneur
│   └── 40-write-config.sh       # réécrit config.json depuis l'environnement
├── package.json
├── next.config.mjs
├── tsconfig.json
├── .env.development             # NEXT_PUBLIC_DEV_GATEWAY=http://localhost:8080
├── public/
│   ├── config.json
│   ├── robots.txt
│   └── favicon.svg              # simple, sans logo d'institution
├── src/
│   ├── app/
│   │   ├── layout.tsx           # lang="fr", métadonnées, pied de page
│   │   ├── page.tsx             # page d'accueil
│   │   ├── connexion/page.tsx
│   │   ├── notes/page.tsx
│   │   ├── profil/page.tsx
│   │   ├── not-found.tsx
│   │   └── globals.css
│   ├── components/              # SiteHeader, RequireAuth, Avatar, GradesTable, …
│   └── lib/
│       ├── config.ts
│       ├── api.ts               # client typé de l'API
│       ├── auth.tsx             # AuthProvider et hook useAuth
│       └── format.ts            # format des notes, initiales
└── tests/
```

## 6. Pages et comportements

Tous les textes sont en français. Un seul gabarit : en-tête, contenu, pied de page.

### En-tête (`SiteHeader`)

- À gauche : le nom « Portail des résultats » en texte (pas de logo).
- À droite, **déconnecté** : un bouton « Connexion » (lien vers `/connexion/`).
- À droite, **connecté** : liens « Mes notes » et « Mon profil », l'avatar avec le nom de l'étudiant, et un bouton « Se déconnecter ».
- Le lien de la page courante est marqué (`aria-current="page"`).

### `/` – Page d'accueil (publique)

Une page **simple**, sans illustration :

- un titre court et une phrase qui présentent la plateforme ;
- un bouton principal « Consulter mes notes » (vers `/connexion/`, ou vers `/notes/` si déjà connecté) ;
- trois points courts : consulter ses notes de CC, de TP et de SN ; voir la moyenne de chaque matière ; personnaliser sa photo de profil.

### `/connexion/` – Connexion (publique)

- **Mise en page en deux colonnes** : le formulaire d'un côté, un panneau discret avec un texte court de l'autre (masqué sur mobile, le formulaire occupe alors toute la largeur).
- Champs : « Matricule » (exemple affiché : `20u2671`) et « Mot de passe » (avec une option pour afficher le texte). Le matricule est nettoyé (espaces) et passé en minuscules avant l'envoi ; format attendu `^\d{2}u\d{4}$`, message « Format attendu : 20u2671 » en cas d'erreur.
- Pendant l'envoi : bouton désactivé avec un état de chargement.
- Erreurs : le message du serveur pour un 401 (`detail`), « Impossible de joindre le serveur » pour une erreur réseau. Les erreurs sont annoncées aux lecteurs d'écran (`aria-live`).
- Succès : le jeton est enregistré, puis redirection vers `/notes/`. Un utilisateur déjà connecté qui ouvre cette page est redirigé vers `/notes/`.

### `/notes/` – Mes notes (protégée)

- Annonce de rubrique en petites capitales espacées (« Semestre S1 »), titre de section avec un repère vertical coloré.
- Sélecteur de semestre : S1 (par défaut) et S2. Un semestre sans note affiche un état vide : « Aucune note pour ce semestre. »
- **Tableau pleine largeur** (pas de colonne étroite centrée) : Code, Matière, Crédits, CC, TP, SN, Moyenne.
  - Nombres alignés à droite, **chiffres tabulaires**, format français avec deux décimales (`14,50`) via `Intl.NumberFormat('fr-FR')`.
  - Une note absente ou une moyenne `null` s'affiche « — », avec un libellé accessible « Note absente ».
  - Sur petit écran (moins de 640 px) : défilement horizontal du tableau, sans casser la mise en page.
- États : chargement (squelette simple), erreur avec un bouton « Réessayer ».
- Une réponse 401 de l'API déconnecte l'utilisateur et le renvoie vers `/connexion/` avec le message « Votre session a expiré. »

### `/profil/` – Mon profil (protégée)

- Affiche le nom complet, le matricule et la photo (cercle de 128 px, **initiales** en secours : premières lettres des deux premiers mots du nom).
- Formulaire de photo : sélection d'un fichier (`accept="image/jpeg,image/png"`), **vérifications côté client** avant l'envoi (type JPEG ou PNG, 2 Mio maximum, messages en français), **aperçu** avant enregistrement, bouton « Enregistrer la photo » avec état de chargement.
- Après un envoi réussi : message de confirmation, mise à jour de la photo ici **et dans l'en-tête**.
- Erreurs du serveur (413, 415, 422) : afficher le `detail` renvoyé. Erreur réseau : « Impossible de joindre le serveur ».
- **Affichage de la photo** selon `photo_url` (section 1) : `null` donne les initiales, un chemin relatif donne `fetch` avec l'en-tête puis un blob (révoquer l'URL d'objet au démontage), une URL absolue sert directement de `src`. Si l'image absolue échoue (URL signée expirée), recharger `/me` **une seule fois** pour obtenir une nouvelle URL.

## 7. Session et authentification

- `lib/auth.tsx` : un `AuthProvider` (contexte React) qui expose `user`, `token`, `login`, `logout`, `refreshUser`, `status` (`loading`, `anonymous`, `authenticated`).
- Le jeton et son heure d'expiration (calculée avec `expires_in`) sont stockés dans **`sessionStorage`** (effacé à la fermeture de l'onglet). C'est un compromis assumé pour un TP : à noter dans « Frontend : décisions ». Pas de jeton de rafraîchissement.
- Au chargement, la session est restaurée si le jeton n'est pas expiré, puis `/me` est appelé. Tant que ce n'est pas fait, `status` vaut `loading` (pas de clignotement vers la page de connexion).
- Il n'y a pas de middleware avec un export statique : la protection se fait côté client par un composant `RequireAuth` qui redirige vers `/connexion/` si l'utilisateur est anonyme. Ce n'est **pas** une mesure de sécurité (c'est l'API qui protège les données) : c'est à écrire dans le `README`.
- Toute réponse 401 d'un appel authentifié déclenche `logout()` et la redirection.

## 8. Client d'API (`lib/api.ts`)

- Fonctions typées : `login`, `getMe`, `uploadPhoto`, `fetchPhotoBlob`, `getGrades`. Les types TypeScript reprennent exactement les réponses de la section 1.
- Une classe `ApiError` avec `status` et `detail`. Les erreurs réseau et les délais dépassés (15 secondes, `AbortController`) sont transformés en un message français clair.
- Les URL de base viennent de `getConfig()`. Aucune adresse écrite en dur dans les composants.
- Pas de bibliothèque HTTP : `fetch` suffit.

## 9. Docker, passerelle et intégration

1. **`frontend/Dockerfile`** en deux étapes : construction avec Node, puis service des fichiers de `out/` par une image Nginx **non-root** (par exemple `nginxinc/nginx-unprivileged`). Le conteneur écoute sur un port non privilégié et expose un contrôle de santé.
2. **`frontend/docker/nginx.conf`** : sert les fichiers statiques avec `try_files $uri $uri/index.html =404`, la page `404.html` pour les erreurs, `Cache-Control: no-store` pour `config.json`, un cache long et `immutable` pour `/_next/static/`.
3. **`frontend/docker/40-write-config.sh`** : script d'entrée de l'image Nginx qui écrit `config.json` à partir de `AUTH_API_URL` et `GRADES_API_URL` (valeurs par défaut `/api/auth` et `/api/grades`).
4. **`docker-compose.yml`** : ajoute le service `frontend` (build `./frontend`, aucun port publié sur l'hôte, contrôle de santé) et fais dépendre la passerelle de ce service.
5. **`docker/nginx/default.conf`** : remplace le texte provisoire de `location /` par un proxy vers le service `frontend`, **en suivant le même motif que les routes existantes** (résolution à la requête avec `resolver` et variable dans `proxy_pass`). Ne touche pas aux routes `/api/auth/` et `/api/grades/` ni à `client_max_body_size`.
6. **`Makefile`** : ajoute `make test-front` (tests et ESLint du frontend) et inclus-le dans `make test`.
7. **`.env.example`** : ajoute `AUTH_API_URL` et `GRADES_API_URL` en commentaire, avec leurs valeurs par défaut.
8. **`README.md`** : ajoute une section « Frontend » (lancement, mode développement avec `npm run dev`, configuration à l'exécution, `config.json`, construction statique `npm run build` et dossier `out/`) et une section « Frontend : décisions ».
9. Vérifie que `scripts/smoke_test.py` et `scripts/check_instances.py` fonctionnent toujours maintenant que `/` renvoie la vraie page d'accueil, et corrige-les au strict minimum si une vérification dépendait du texte provisoire.

## 10. Design

Principes à appliquer partout :

- **Aucune décoration gratuite** : pas de dégradés marqués, d'effets de flou, de métaphores thématiques (pas de chapeau de diplômé ni de livres), d'ombres appuyées, ni de panneaux latéraux superflus. La seule mise en page en deux colonnes est celle de la page de connexion.
- **Sobriété institutionnelle**, mais pas froide : l'interface est celle d'un portail officiel lisible et calme.
- **Typographie** : pile de polices système ; annonces de rubrique en **petites capitales espacées** ; **chiffres tabulaires** sur tous les nombres ; titres de section à interlettrage serré avec un **repère vertical coloré** à gauche.
- **Pages denses en données** (notes) : grille pleine largeur plutôt qu'une colonne centrée étroite.
- **Couleurs** : il n'y a pas de charte graphique fournie, donc une palette neutre (gris ardoise) avec **un seul accent bleu**, définie en un seul endroit pour être remplacée facilement si une charte est fournie plus tard. Ne pas inventer d'autres couleurs.
- **Accessibilité** : contraste suffisant (AA), focus clavier visible, étiquettes associées aux champs, messages d'erreur annoncés (`aria-live`), navigation complète au clavier, `lang="fr"`.
- **Adaptatif** : lisible de 375 px à un grand écran.

## 11. Étapes et critères d'acceptation

### Étape 1 – Socle

Projet Next.js (export statique) avec Tailwind et Vitest, `lib/config.ts`, `lib/api.ts`, `lib/auth.tsx`, `lib/format.ts`, `public/config.json`, `robots.txt`, `.env.development`, `layout.tsx` avec pied de page fictif.

Validation : `npm run build` produit `out/` sans erreur. Tests unitaires verts : chargement et repli de la configuration, résolution des URL relatives, format des notes (`14,50`, `—`), initiales, client d'API (succès, 401, erreur réseau) avec `fetch` simulé.

### Étape 2 – En-tête, accueil et connexion

`SiteHeader`, page d'accueil, page de connexion, `AuthProvider`, `RequireAuth`.

Validation : avec le backend lancé (`make up && make seed`) et `npm run dev` : la connexion avec `20u2671` fonctionne et redirige vers `/notes/` (page vide pour l'instant), un mauvais mot de passe affiche le message du serveur, un matricule mal formé est refusé avant l'envoi, la déconnexion fonctionne, l'en-tête change selon l'état.

### Étape 3 – Mes notes

Page `/notes/` avec le tableau, le sélecteur de semestre et les états.

Validation : le compte `20u2671` voit 10 matières dont **une avec un TP absent** affiché « — » et une moyenne « — » ; les nombres sont au format français ; S2 affiche l'état vide ; un jeton invalide renvoie vers la connexion avec le message d'expiration. Tests de composant pour le tableau.

### Étape 4 – Mon profil et photo

Page `/profil/`, composant `Avatar`, envoi de photo.

Validation (mode `local`) : l'envoi d'un JPEG et d'un PNG fonctionne et l'avatar change dans la page et dans l'en-tête ; un GIF, un fichier de plus de 2 Mio et un fichier texte renommé en `.jpg` sont refusés avec un message clair ; sans photo, les initiales s'affichent. Tests de composant pour les vérifications côté client.

### Étape 5 – Conteneur, passerelle et README

Tout ce qui est décrit en section 9.

Validation : à partir d'une machine propre (`docker compose down -v`), `make up && make seed && make smoke` passe. En ouvrant `http://localhost:8080/`, le parcours complet fonctionne (accueil, connexion, notes, photo) **via la passerelle**, avec les routes `/api/*` toujours opérationnelles. `make test` exécute les tests du backend et du frontend. Les valeurs `AUTH_API_URL` et `GRADES_API_URL` modifient bien `config.json` au démarrage du conteneur (à vérifier avec `curl`).

### Étape suivante (à ne faire que sur demande de l'utilisateur)

**Étape 6 – Mode S3.** Avec le profil compose `s3` (MinIO) : la photo s'affiche à partir de l'URL signée absolue, et une URL expirée déclenche un unique rechargement de `/me`. Rappel : l'URL signée contient l'hôte `minio`, qu'il faut déclarer dans `/etc/hosts` pour l'ouvrir depuis le navigateur de la machine hôte.

## 12. Qualité attendue

- TypeScript strict, pas de `any`, pas de `console.log` oublié, pas de code mort.
- ESLint propre et formatage cohérent.
- Aucun secret ni adresse de serveur dans le code ou dans `out/`.
- Aucune requête réseau vers un tiers (vérifie la page avec les outils de développement du navigateur).
- Les tests ne dépendent ni du backend ni de Docker.

## 13. Hors périmètre

À ne **pas** construire : inscription, mot de passe oublié, modification du profil autre que la photo, saisie ou modification de notes, espace enseignant ou admin, graphiques, mode sombre, multilingue, notifications, application mobile, rendu côté serveur, PWA.
