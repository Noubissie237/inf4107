# INF4107 – Plateforme de consultation des notes (backend)

Backend de l'application de consultation de notes : deux microservices FastAPI
(`auth-service`, `grades-service`), chacun avec sa base PostgreSQL, derrière une
passerelle Nginx qui route par chemin. Le frontend n'est pas encore écrit.
La référence détaillée (contraintes, modèle de données, étapes) est dans [CLAUDE.md](CLAUDE.md).

```
                 ┌────────────────────┐   /api/auth/*    ┌──────────────┐   ┌─────────┐
 navigateur ───▶ │ gateway (Nginx :80)│ ───────────────▶ │ auth-service │──▶│ auth_db │
  :8080          │                    │   /api/grades/*  ├──────────────┤   ├─────────┤
                 │                    │ ───────────────▶ │grades-service│──▶│grades_db│
                 └────────────────────┘   /  (texte)     └──────────────┘   └─────────┘
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

Ensuite : `http://localhost:8080/` (texte provisoire), documentation interactive sur
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
| GET | `/` | passerelle | non | Texte provisoire |

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

Les tests tournent sans Docker ni PostgreSQL (SQLite en mémoire) :

```bash
make venv        # une seule fois
make test        # tests des deux services
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
