# INF4107 – Plateforme de consultation des notes

Application de consultation de notes : un frontend statique (Next.js) et deux microservices
FastAPI (`auth-service`, `grades-service`), chacun avec sa base PostgreSQL, derrière une
passerelle Nginx qui route par chemin. La référence détaillée du backend (contraintes, modèle de
données, étapes) est dans [CLAUDE.md](CLAUDE.md), celle du frontend dans
[FRONTEND_SPEC.md](FRONTEND_SPEC.md).

```
                 ┌────────────────────┐   /api/auth/*    ┌──────────────┐   ┌─────────┐
 navigateur ───▶ │ gateway (Nginx :80)│ ───────────────▶ │ auth-service │──▶│ auth_db │
  :8080          │                    │   /api/grades/*  ├──────────────┤   ├─────────┤
                 │                    │ ───────────────▶ │grades-service│──▶│grades_db│
                 │                    │   /              └──────────────┘   └─────────┘
                 │                    │ ───────────────▶ ┌──────────────┐
                 └────────────────────┘                  │   frontend   │ (fichiers statiques)
                                                         └──────────────┘
```

Les deux services ne s'appellent jamais entre eux : `auth-service` émet un JWT,
`grades-service` le vérifie avec le secret partagé `JWT_SECRET`.

## Lancement local en quatre commandes

Prérequis : Docker avec Compose, `make`, Python 3 avec le module `venv` (sur Ubuntu/Debian :
`sudo apt install python3-venv`), pour les tests et le test de bout en bout.

```bash
cp .env.example .env                  # valeurs de développement
make up                               # construit et démarre postgres, services, passerelle
make seed                             # 2000 étudiants fictifs + le compte 20u2671
make venv && make smoke               # environnement Python local (.venv), test de bout en bout
```

`make venv` crée `.venv/` et y installe les dépendances de test. Les cibles `make test` et
`make smoke` utilisent automatiquement ce `.venv` (sinon `python3`). Un `pip install` hors
environnement virtuel est refusé par les distributions récentes (« externally-managed-environment »).

Ensuite : l'application est sur `http://localhost:8080/`, la documentation interactive sur
`http://localhost:8080/api/auth/docs` et `http://localhost:8080/api/grades/docs`.
Connexion avec le matricule `20u2671` et le mot de passe `SEED_PASSWORD` du fichier `.env`.

Arrêt : `make down`. Pour repartir de zéro (bases et photos) : `docker compose down -v`.

## Routes

| Méthode | Chemin | Service | Jeton | Rôle |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | auth | non | Connexion, renvoie le JWT |
| GET | `/api/auth/me` | auth | oui | Profil et `photo_url` |
| PUT | `/api/auth/me/photo` | auth | oui | Envoi de la photo (JPEG/PNG, 2 Mio max) |
| GET | `/api/auth/me/photo` | auth | oui | Lecture de la photo |
| GET | `/api/auth/health` | auth | non | Santé (base de données comprise) |
| GET | `/api/grades/me/grades?semester=S1` | grades | oui | Notes CC, TP, SN et moyenne |
| GET | `/api/grades/health` | grades | non | Santé |
| GET | `/`, `/connexion/`, `/notes/`, `/profil/` | frontend | non | Pages du site (la protection des pages se fait côté client, c'est l'API qui protège les données) |

Le jeton se passe dans l'en-tête `Authorization: Bearer <jwt>`.

## Variables d'environnement

Toute la configuration passe par l'environnement (aucun secret ni hôte en dur).

| Variable | Service | Rôle | Défaut |
| --- | --- | --- | --- |
| `DATABASE_URL` | les deux | URL SQLAlchemy (`postgresql+psycopg://...`) | obligatoire |
| `JWT_SECRET` | les deux | Secret partagé, 32 caractères minimum | obligatoire |
| `JWT_EXPIRE_MINUTES` | auth | Durée de validité du jeton | `60` |
| `INSTANCE_ID` | les deux | Matricule de l'étudiant, renvoyé par `/health` | `local` |
| `CORS_ORIGINS` | les deux | Origines autorisées, séparées par des virgules | `http://localhost:8080,http://localhost:3000` |
| `LOG_LEVEL` | les deux | Niveau des journaux (sortie standard) | `INFO` |
| `PORT` | les deux | Port d'écoute | `8000` |
| `DB_POOL_SIZE` | les deux | Taille du pool de connexions | `5` |
| `RUN_MIGRATIONS` | les deux | Lancer `alembic upgrade head` au démarrage | `true` |
| `STORAGE_BACKEND` | auth | `local` ou `s3` | `local` |
| `STORAGE_LOCAL_DIR` | auth | Dossier des photos (mode `local`) | `/data/photos` |
| `S3_BUCKET` | auth | Bucket des photos (obligatoire en mode `s3`) | |
| `S3_REGION` | auth | Région du bucket | |
| `S3_ENDPOINT_URL` | auth | Endpoint personnalisé, facultatif (MinIO) | |
| `GRADE_WEIGHTS` | grades | Pondération `CC,TP,SN`, somme égale à 1 | `0.3,0.2,0.5` |

En plus, `.env` contient `POSTGRES_USER`, `POSTGRES_PASSWORD` et `SEED_PASSWORD`, utilisés
par docker-compose et le seed. Le vrai `.env` est dans `.gitignore`.
Les identifiants S3 ne sont jamais dans le code : boto3 utilise sa chaîne par défaut
(rôle IAM, variables standard `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`...).

## Tests

Les tests tournent sans Docker ni PostgreSQL (SQLite en mémoire pour le backend) :

```bash
make venv        # une seule fois
make test        # tests des deux services, puis ESLint et tests du frontend
make test-front  # frontend seulement (Node.js requis, installe les paquets la première fois)
```

Le test de bout en bout `scripts/smoke_test.py` s'exécute contre la passerelle :

```bash
make smoke                                                    # ou, à la main :
.venv/bin/python scripts/smoke_test.py http://localhost:8080 20u2671   # mot de passe : SEED_PASSWORD
```

Il vérifie le health des deux services, la connexion, `/me`, les notes, l'envoi d'une photo
et sa relecture. Chaque étape affiche `[OK]` ou `[ÉCHEC]`, le code de sortie est non nul en cas d'échec.

## Seed

Image Docker autonome (`seed/`), utilisable partout avec seulement des URL de bases :

```bash
docker compose --profile tools run --rm seed --students 2000 --my-matricule 20u2671
```

Options : `--students`, `--my-matricule`, `--password` (ou `SEED_PASSWORD`), `--seed`,
`--reset`. Variables : `AUTH_DATABASE_URL` et `GRADES_DATABASE_URL`. Les migrations doivent
déjà avoir été appliquées (c'est le cas dès que les services ont démarré).

## Frontend

Le frontend (`frontend/`) est un site **statique** : Next.js (App Router, TypeScript strict,
Tailwind CSS) exporté en fichiers HTML, CSS et JavaScript dans `frontend/out/`. Il n'a besoin
d'aucun serveur Node pour fonctionner. Pages : accueil (`/`), connexion (`/connexion/`), notes
(`/notes/`) et profil avec photo (`/profil/`).

### Lancement

Avec Docker, rien à installer : `make up` construit et démarre aussi le service `frontend` (image
Nginx non-root, port 8080 du conteneur, aucun port publié sur la machine), que la passerelle sert
sur `http://localhost:8080/`.

### Mode développement

Avec le backend lancé (`make up && make seed`) :

```bash
cd frontend
npm ci            # la première fois
npm run dev       # http://localhost:3000
```

Le fichier `frontend/.env.development` (`NEXT_PUBLIC_DEV_GATEWAY=http://localhost:8080`) fait parler
le site au backend via la passerelle ; le backend autorise déjà l'origine `http://localhost:3000`
(`CORS_ORIGINS`). Cette variable n'existe que pour `npm run dev` : elle n'est pas dans le site construit.

### Configuration à l'exécution (`config.json`)

Le site ne contient **aucune adresse de serveur figée** : au démarrage, il lit `/config.json` :

```json
{ "authApiUrl": "/api/auth", "gradesApiUrl": "/api/grades" }
```

- Les valeurs par défaut sont des **chemins relatifs** : tout fonctionne quand le site et l'API
  sont servis sous la même adresse (passerelle, CloudFront avec plusieurs origines, load balancer).
- Elles peuvent être des **URL absolues** (par exemple `https://api.20u2671.inf4107.site/api/auth`)
  quand l'API a un autre nom de domaine : c'est un choix d'architecture des étudiants. Dans ce cas
  l'API doit autoriser l'origine du site (`CORS_ORIGINS`).
- Si le fichier est absent ou invalide, les valeurs par défaut s'appliquent.
- Dans le conteneur, un script d'entrée **réécrit `config.json` à chaque démarrage** à partir des
  variables `AUTH_API_URL` et `GRADES_API_URL`, sans reconstruire l'image :

```bash
AUTH_API_URL=https://api.20u2671.inf4107.site/api/auth \
GRADES_API_URL=https://api.20u2671.inf4107.site/api/grades \
  docker compose up -d frontend
curl http://localhost:8080/config.json
```

(Ces variables peuvent aussi se mettre dans `.env`, voir `.env.example`.)

### Construction statique

```bash
cd frontend
npm ci && npm run build      # produit frontend/out/
```

Le dossier `out/` se dépose **tel quel** sur n'importe quel hébergement statique (bucket avec CDN,
Nginx, PaaS...). Deux règles pour l'héberger : servir `index.html` d'un dossier pour `/dossier/`
(par exemple `/connexion/` vers `connexion/index.html`) et renvoyer `404.html` pour une page
inconnue. Modifiez `out/config.json` pour changer les adresses de l'API. `frontend/docker/nginx.conf`
est un exemple complet, avec `Cache-Control: no-store` pour `config.json` et un cache long pour
`/_next/static/`.

## Test de charge (k6)

`loadtest/k6.js` monte à 200 utilisateurs virtuels en 2 minutes, puis maintient ce palier
3 minutes. Chaque utilisateur se connecte **une seule fois** avec un matricule tiré au hasard
dans la plage du seed (`20u0001` à `20u2000`), puis consulte ses notes du S1 une fois par
seconde en réutilisant son jeton (il se reconnecte seulement si le jeton est refusé).
Seuils : `http_req_duration` p(95) < 800 ms et moins de 1 % d'erreurs (`http_req_failed`).

```bash
k6 run -e BASE_URL=https://20u2671.inf4107.site -e PASSWORD=<SEED_PASSWORD> loadtest/k6.js
# sans k6 installé :
docker run --rm -i --network host grafana/k6 run -e BASE_URL=http://localhost:8080 \
  -e PASSWORD=<SEED_PASSWORD> - < loadtest/k6.js
```

Paramètres : `BASE_URL` (défaut `http://localhost:8080`), `PASSWORD` (obligatoire),
`STUDENTS` (nombre d'étudiants du seed, 2000 par défaut). Pour un essai court, ajoutez
`--vus 20 --duration 20s` (remplace les paliers).

Ordre de grandeur sur un PC portable, une seule instance par service : p(95) d'environ
260 ms à 200 utilisateurs. Le coût principal est le hachage bcrypt du login : le seed utilise
un coût de 10 (`--bcrypt-rounds` ou `BCRYPT_ROUNDS`, 4 à 14), le coût 12 de la bibliothèque
rendrait chaque connexion environ 4 fois plus lourde. Le coût est écrit dans le hash : pour le
changer, relancez le seed avec `--reset`.

## Mode S3 en local (MinIO)

Le profil compose `s3` démarre MinIO et crée le bucket automatiquement. Dans `.env`,
décommentez le bloc « S3 mode » de `.env.example` (`STORAGE_BACKEND=s3`, `S3_BUCKET`,
`S3_REGION`, `S3_ENDPOINT_URL=http://minio:9000`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`), puis :

```bash
docker compose --profile s3 up -d --build
```

La console MinIO est sur `http://localhost:9001`. En mode `s3`, `photo_url` et
`GET /api/auth/me/photo` (redirection 307) pointent vers une URL signée valable 15 minutes :
la miniature `photos/thumb/<matricule>.jpg` si elle existe, sinon l'original.

L'URL signée contient l'hôte `minio` : pour l'ouvrir depuis votre machine, ajoutez
`127.0.0.1 minio` à `/etc/hosts` (ou utilisez `curl --resolve minio:9000:127.0.0.1 ...`).
Changer l'hôte casserait la signature. Avec un vrai bucket AWS, ce problème n'existe pas.

## Fonction de miniature (`lambda/thumbnailer/`)

`handler.py` (`lambda_handler(event, context)`) est déclenchée par les événements S3
`ObjectCreated` du bucket. Pour chaque clé commençant par `photos/original/`, elle recadre
l'image au centre en carré (`ImageOps.fit`), la réduit à 128 × 128 (variable `THUMB_SIZE`),
l'encode en JPEG (qualité 85) et l'écrit sous `photos/thumb/<matricule>.jpg`. Toute autre clé
est ignorée, ce qui évite une boucle (la miniature n'est pas sous `photos/original/`).

- Rôle IAM de la fonction : `s3:GetObject` sur `photos/original/*` et `s3:PutObject` sur
  `photos/thumb/*`. Le trigger S3 peut être filtré sur le préfixe `photos/original/`.
- **Pillow doit être empaqueté pour Linux** : `pip install` depuis un Mac ou un Windows
  produit des binaires inutilisables dans Lambda. Deux solutions : une couche (layer)
  construite sous Linux (`pip install -r requirements.txt --platform manylinux2014_x86_64
  --only-binary=:all: --target python/`), ou l'image de conteneur du `Dockerfile` fourni
  (facultatif, basé sur `public.ecr.aws/lambda/python:3.12`). `boto3` est déjà fourni par
  le runtime Lambda.
- Tests : `cd lambda/thumbnailer && pip install -r requirements-dev.txt && python -m pytest`.

## Décisions

- Passerelle Nginx : la configuration est un modèle (`docker/nginx/default.conf.template`,
  traité par l'image Nginx au démarrage). Les services sont résolus à la requête (variables
  dans `proxy_pass`) : la passerelle démarre même si un service n'est pas encore prêt et suit
  un service dont l'IP change. Le serveur DNS n'est pas écrit en dur : l'image le lit dans
  `/etc/resolv.conf` (`NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`), ce qui marche sous Docker,
  Kubernetes ou ECS. Les adresses des services se règlent par `AUTH_UPSTREAM` et
  `GRADES_UPSTREAM`. L'URL reste transmise inchangée.
- Le `docker-compose.yml` fixe `name: inf4107-backend`. Sans cela, le projet s'appelle
  « backend » (nom du dossier) et peut réutiliser un volume `backend_pgdata` d'un
  autre projet, ce qui empêche la création des bases.
- Les dépendances `Pillow` et `python-multipart` (étape 5) et `boto3` (étape 7) ne sont
  ajoutées qu'aux étapes qui les utilisent. `boto3` alourdit l'image `auth-service` et sa
  construction (environ 2 minutes la première fois).
- `auth-service` : pour ne pas révéler si un matricule existe par le temps de réponse, un
  hash bcrypt factice est vérifié quand le matricule est inconnu.
- `grades-service` : `GRADE_WEIGHTS` est validé par Pydantic au chargement de la
  configuration : un mauvais réglage empêche le service de démarrer. Les poids sont
  traités en `Decimal` (somme exactement égale à 1), la moyenne est arrondie à
  2 décimales « au plus proche, 0,5 vers le haut » (11,075 donne 11,08).
- `grades-service` : le matricule vient uniquement du claim `sub` du jeton, il n'y a
  aucun paramètre permettant de consulter les notes d'un autre étudiant.
- `grades-service` : les contraintes (notes entre 0 et 20, crédits > 0, unicité
  matricule + matière) sont déclarées dans la migration et dans le modèle.
- Seed : l'image est autonome (SQL direct avec `psycopg`, URL `postgresql://` et non
  `postgresql+psycopg://`). Sans `--reset`, les insertions ignorent les doublons : les
  comptes déjà présents gardent leur ancien mot de passe. Avec `--reset`, les tables
  sont vidées d'abord.
- Seed : le compte `--my-matricule` a toutes ses notes, sauf le TP d'une matière
  (tirée au hasard), pour montrer le cas « — ». Les données sont reproductibles
  avec `--seed` (hors sel bcrypt).
- Photo : en mode `local`, `photo_url` vaut `/api/auth/me/photo` (le frontend l'appelle avec
  l'en-tête `Authorization`). En mode `s3`, c'est une URL signée (voir plus haut).
- S3 : les URL signées utilisent la signature SigV4 (`signature_version="s3v4"`) : la
  signature par défaut de boto3 avec un endpoint personnalisé est l'ancienne SigV2, refusée
  par les régions AWS récentes. `GET /me` fait un `head_object` pour savoir si la miniature
  existe (un appel S3 de plus, acceptable ici).
- MinIO : la création du bucket utilise le client `mc` déjà présent dans l'image
  `minio/minio` (l'image `minio/mc` n'était pas téléchargeable depuis cet environnement).
  Le mode S3 se règle via `.env` (l'`env_file` des services), pas via un fichier compose séparé.
- Photo : la limite de 2 Mio est vérifiée en lisant au plus 2 Mio + 1 octet du fichier.
  Nginx accepte jusqu'à 3 Mo (`client_max_body_size`) pour laisser l'API répondre 413
  avec son message plutôt que le 413 générique de Nginx.
- Photo : un fichier tronqué ou corrompu (vérifié par `Image.verify()`) est refusé en 415,
  comme un format non supporté. Des dimensions dépassant 4000 × 4000 donnent un 422.
- Smoke test : seule dépendance `httpx` (`scripts/requirements.txt`) ; l'image PNG de
  test est fabriquée à la main. En mode S3, la relecture de la photo vérifie la redirection
  307 (l'hôte `minio` n'est pas joignable depuis la machine hôte). Le mot de passe est lu dans `SEED_PASSWORD`
  (`make smoke` charge `.env`).
- Test de charge : un seul login par utilisateur virtuel puis des consultations de notes
  (plus réaliste, et le login bcrypt ne domine plus la mesure). Le mot de passe n'est pas
  écrit dans le script, il se passe avec `-e PASSWORD=...`.
- Seed : coût bcrypt de 10 par défaut (configurable). Le hash factice d'`auth-service`
  (matricule inconnu) a le même coût 10 pour que les deux échecs de login durent autant ;
  si vous seedez avec un autre coût, la différence de durée devient mesurable.
- `make seed` reconstruit l'image du seed avant de l'exécuter (`docker compose run` ne
  reconstruit jamais une image existante).
- Makefile : `python` n'existe pas sur toutes les machines (Ubuntu n'a que `python3`) ;
  la variable `PYTHON` vaut `.venv/bin/python` si `make venv` a été lancé, sinon `python3`.

## Frontend : décisions

Le frontend (`frontend/`, décrit dans [FRONTEND_SPEC.md](FRONTEND_SPEC.md)) a été construit étape
par étape. Décisions de l'étape 1 (socle) :

- Export statique (`output: 'export'`) : `npm run build` produit `frontend/out/`, déposable
  tel quel sur un hébergement statique.
- Les adresses des API se lisent à l'exécution dans `/config.json` (jamais figées au build).
  Les valeurs par défaut sont des chemins relatifs (`/api/auth`, `/api/grades`). Si le fichier
  est absent ou invalide, ces valeurs par défaut sont utilisées.
- Mode développement seulement : `NEXT_PUBLIC_DEV_GATEWAY` (`frontend/.env.development`)
  préfixe les chemins relatifs pour que `npm run dev` (port 3000) parle à la passerelle
  (port 8080). Cette branche est supprimée du build de production.
- Le jeton JWT est conservé dans `sessionStorage` (effacé à la fermeture de l'onglet) :
  compromis assumé pour un TP. Un script de la page pourrait le lire en cas de faille XSS ;
  il n'y a pas de jeton de rafraîchissement.
- Versions : npm a installé les dernières versions compatibles entre elles (Next.js 16,
  React 19, TypeScript 6, ESLint 9, Vitest 5, Tailwind CSS 4), figées par `package-lock.json`.
  Les versions plus récentes publiées (TypeScript 7, ESLint 10) n'ont pas été retenues par npm :
  elles ne satisfont pas les dépendances des autres paquets.
- Palette : gris ardoise et un seul accent bleu, définie une seule fois dans
  `src/app/globals.css` (bloc `@theme`).

Décisions de l'étape 2 (en-tête, accueil, connexion) :

- La protection des pages (`RequireAuth`) se fait côté client : un export statique n'a pas de
  serveur ni de middleware. **Ce n'est pas une mesure de sécurité** : c'est l'API qui protège
  les données (sans jeton valide, elle répond 401).
- La page de connexion n'affiche le formulaire que lorsque l'état est « anonyme » : pendant la
  restauration de la session (`loading`), elle affiche « Chargement… », ce qui évite un
  clignotement du formulaire chez un étudiant déjà connecté. Quand l'état devient « connecté »
  (connexion à l'instant ou session restaurée), une seule redirection vers `/notes/` s'applique.
- Le message « Votre session a expiré. » s'affiche sur la page de connexion quand un appel
  authentifié a reçu un 401 (`sessionExpired` dans le contexte d'authentification).
- Après « Se déconnecter », l'étudiant reste sur la page courante si elle est publique ; une page
  protégée le renvoie vers `/connexion/`.
- Dans les tests unitaires, `next/link` n'ajoute pas la barre oblique finale (c'est l'option
  `trailingSlash` de Next qui le fait dans le vrai build) : les tests acceptent les deux formes.
- Les classes des boutons et des champs sont définies une seule fois dans
  `src/components/styles.ts`.

Décisions de l'étape 3 (notes) :

- Le sélecteur de semestre est une liste déroulante étiquetée (S1 par défaut, S2) : native,
  accessible au clavier, sans composant à écrire. Une réponse qui arrive après un changement de
  semestre est ignorée.
- Une absence de note s'affiche « — » avec le libellé « Note absente » réservé aux lecteurs d'écran
  (classe `sr-only`). Le conteneur à défilement du tableau est `relative` : sans cela, ces libellés
  (en position absolue) élargissaient toute la page sur téléphone (défaut trouvé à 375 px).
- Une réponse 401 pendant la consultation déconnecte l'étudiant, qui est renvoyé vers
  `/connexion/` avec « Votre session a expiré. ». Ce message s'affiche aussi quand un jeton
  conservé dans l'onglet est périmé ou refusé au chargement de la page. Il n'apparaît pas quand le
  serveur est simplement injoignable.
- Le chargement affiche un squelette ; une erreur réseau ou serveur affiche son message et un
  bouton « Réessayer ».

Décisions de l'étape 4 (profil et photo) :

- L'adresse de la photo affichée (`photoSrc`) est calculée une seule fois, dans le contexte
  d'authentification, et partagée par la page de profil et l'en-tête : un seul téléchargement,
  et les deux changent en même temps après un envoi. Selon `photo_url` : `null` donne les
  initiales ; un chemin relatif (mode local) est téléchargé avec `fetch` et l'en-tête
  `Authorization`, puis affiché via une URL d'objet (révoquée quand elle ne sert plus) ; une
  URL absolue (mode S3) sert directement de `src`. La photo n'est jamais mise en cache par le
  navigateur (`cache: 'no-store'`), car l'adresse `/api/auth/me/photo` reste la même quand la
  photo change.
- Si l'image d'une URL absolue ne se charge pas (URL signée expirée), `/me` est rechargé **une
  seule fois** pour obtenir une nouvelle URL. Un nouvel envoi de photo (ou une actualisation
  volontaire du profil) réarme ce rechargement.
- Vérifications côté client avant l'envoi : type JPEG ou PNG et 2 Mio maximum, avec aperçu
  avant l'enregistrement. Le type vient de la déclaration du navigateur (selon l'extension) : un
  fichier texte renommé en `.jpg` passe donc ce contrôle et c'est le serveur qui le refuse (415,
  message affiché tel quel). Le serveur garde le dernier mot (413, 415, 422).
- Après un envoi réussi, le profil est rechargé (`/me`), le champ de fichier est vidé et un
  message de confirmation s'affiche.
- Les comptes du seed partagent le même mot de passe : les tests manuels d'envoi de photo
  laissent donc des photos dans le volume `photos` (supprimées par `docker compose down -v`).

Décisions de l'étape 5 (conteneur, passerelle, intégration) :

- Image en deux étapes : construction avec `node:24-alpine` (`npm ci` puis `npm run build`), puis
  service de `out/` par `nginxinc/nginx-unprivileged` (utilisateur `nginx`, port 8080, pas de
  `root`). `GET /healthz` répond « ok » : il sert au `HEALTHCHECK` de l'image et à celui de compose.
- Le script d'entrée appartient à `/docker-entrypoint.d/` et écrit `config.json` à chaque démarrage
  (échappement des guillemets et barres obliques inverses pour que le JSON reste valide). Le
  dossier du site appartient à l'utilisateur `nginx` pour que ce script puisse l'écrire.
- La passerelle envoie tout ce qui n'est pas `/api/auth/` ni `/api/grades/` au frontend, selon le
  même motif que les API (résolution à la requête). Son adresse se règle par `FRONTEND_UPSTREAM`
  (`http://frontend:8080` par défaut), comme `AUTH_UPSTREAM` et `GRADES_UPSTREAM`. La spec cite
  `docker/nginx/default.conf` : le fichier du dépôt est devenu `default.conf.template`.
- Le fichier de verrouillage `package-lock.json` a dû être régénéré avec le npm de l'image Node :
  celui produit par un npm plus ancien n'était pas accepté par `npm ci` (dépendances optionnelles
  `@emnapi/*` absentes). Il est maintenant accepté par npm 11.6 (poste) et 11.19 (image).
- `make test` exécute les tests du backend puis `make test-front` (ESLint et tests Vitest). Si
  `node_modules` n'existe pas, `make test-front` lance d'abord `npm ci`.
- `scripts/smoke_test.py` et `teacher/check_instances.py` fonctionnent sans changement : aucune de
  leurs vérifications ne dépendait du texte provisoire de la page d'accueil (le contrôle de
  l'accueil vérifie seulement un statut 200).

