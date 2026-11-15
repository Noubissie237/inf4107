# INF4107 – Plateforme de consultation des notes : backend

> Ce fichier est la référence complète du backend. Place-le à la racine du dépôt sous le nom `CLAUDE.md` pour que Claude Code le charge à chaque session.

## 0. Règles de travail

- Lis tout ce fichier avant d'écrire du code.
- Travaille **étape par étape** (section 12). À la fin de chaque étape : lance les commandes de validation, résume en quelques lignes ce qui a été fait, puis **arrête-toi** et attends le feu vert de l'utilisateur avant l'étape suivante.
- Reste **simple** : pas d'abstraction, de bibliothèque ni de fonctionnalité qui ne soit pas demandée ici. C'est un support de TP, le code doit être lisible par des étudiants de Master 1.
- Pour tout détail non précisé, décide toi-même et note la décision dans la section « Décisions » du `README.md`.
- Code, noms de variables et commentaires en **anglais**. Messages d'erreur renvoyés par l'API et `README.md` en **français**.
- Le frontend (`frontend/`) est décrit à part, dans FRONTEND_SPEC.md, et il est construit : ne le modifie pas en travaillant sur le backend. Le contrat de l'API (sections 7 et 8) est ce dont il dépend : tout changement de ce contrat doit être signalé.

## 1. Contexte du projet

Des étudiants de M1 Informatique doivent déployer sur le cloud, chacun sur son propre sous-domaine (`https://<matricule>.inf4107.site`, par exemple `https://20u2671.inf4107.site`), une application de consultation de notes. Ils proposent d'abord une architecture de déploiement, la justifient, puis la réalisent (VM, conteneurs, PaaS, serverless, base managée, stockage objet, DNS, HTTPS…).

L'application est un prétexte : **le backend doit donc être simple à écrire mais facile à déployer de plusieurs façons différentes**.

Parcours utilisateur : un étudiant se connecte avec son matricule et son mot de passe, consulte ses notes de **CC** (contrôle continu), **TP** et **SN** (session normale) pour chaque matière, et peut définir ou changer sa photo de profil.

Ce backend se compose de **deux microservices FastAPI** indépendants, chacun avec sa propre base PostgreSQL, derrière une passerelle Nginx qui route par chemin :

| Chemin | Cible |
| --- | --- |
| `/api/auth/*` | `auth-service` |
| `/api/grades/*` | `grades-service` |
| `/` (et tout le reste) | `frontend` : site statique Next.js (pages `/`, `/connexion/`, `/notes/`, `/profil/`), décrit dans FRONTEND_SPEC.md |

Les deux services **ne s'appellent jamais entre eux**. `auth-service` émet un JWT, `grades-service` le vérifie avec un secret partagé.

## 2. Contraintes de déployabilité (non négociables)

Ces règles garantissent que les étudiants pourront déployer le code partout :

1. **Sans état** : aucun état en mémoire entre deux requêtes. Seule exception : le stockage `local` des photos, qui est un mode de développement.
2. **Configuration uniquement par variables d'environnement** (section 5). Aucun secret, hôte ni URL en dur. Les identifiants cloud (S3) utilisent la **chaîne d'identifiants par défaut de boto3** (rôle IAM, variables standard), jamais des clés dans le code.
3. Chaque service écoute sur `0.0.0.0` et le port `PORT` (8000 par défaut).
4. **Journaux sur la sortie standard** (pas de fichier), niveau réglable par `LOG_LEVEL`.
5. Chaque service expose `GET <préfixe>/health` (section 7 et 8), utilisable par un load balancer.
6. **Préfixe de chemin natif** : toutes les routes d'un service, y compris la documentation, sont sous son préfixe (`/api/auth` ou `/api/grades`). Ainsi un load balancer ou une API Gateway peut router par chemin **sans réécriture d'URL**.
7. Au démarrage, le service **réessaie de se connecter à la base** (jusqu'à environ 30 secondes) au lieu de planter : en cloud, la base peut être prête après le conteneur.
8. Les migrations Alembic s'exécutent au démarrage si `RUN_MIGRATIONS=true` (valeur par défaut), et peuvent être désactivées.
9. Images Docker légères (`python:3.12-slim`), exécutées par un **utilisateur non-root**.
10. Le code doit rester **compatible avec un adaptateur serverless** (type Mangum) : pas de tâche de fond, pas de dépendance à un démarrage long.

## 3. Arborescence cible

```
.
├── CLAUDE.md                  # ce fichier
├── README.md                  # en français : lancement local, tests, décisions
├── Makefile                   # up, down, seed, venv, test, smoke
├── docker-compose.yml         # name: inf4107-backend ; profils tools (seed) et s3 (MinIO)
├── .env.example
├── .gitignore
├── docker/
│   ├── nginx/default.conf.template   # modèle traité par l'image Nginx (envsubst)
│   └── postgres/init-databases.sh
├── auth-service/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── alembic.ini
│   ├── alembic/              # env.py + versions/
│   ├── app/
│   │   ├── main.py           # création de l'app, routeur, CORS, logs
│   │   ├── config.py         # Settings (pydantic-settings)
│   │   ├── db.py             # engine, session, attente de la base
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py       # hachage, JWT, dépendance get_current_user
│   │   ├── storage.py        # LocalStorage et S3Storage
│   │   └── routes.py
│   └── tests/
├── grades-service/
│   ├── (même structure, sans storage.py)
│   └── tests/
├── seed/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── seed.py
├── frontend/                  # site statique Next.js, voir FRONTEND_SPEC.md (Dockerfile, docker/, src/, tests/)
├── scripts/
│   ├── smoke_test.py         # test de bout en bout sur la passerelle
│   └── requirements.txt      # httpx
├── lambda/thumbnailer/       # étape 7 : handler.py, requirements.txt, Dockerfile, tests
├── loadtest/k6.js            # étape 8
└── teacher/                  # outils enseignant, À NE PAS DISTRIBUER aux étudiants
    ├── check_instances.py    # étape 8
    └── README.md
```

Le dossier `teacher/` est réservé à l'enseignant : il est retiré du dépôt remis aux étudiants.

## 4. Stack

- Python 3.12, FastAPI, Uvicorn (`uvicorn[standard]`).
- SQLAlchemy 2.x en mode **synchrone** avec psycopg 3 (`psycopg[binary]`), endpoints déclarés avec `def`. Pool configurable (`DB_POOL_SIZE`, 5 par défaut), `pool_pre_ping=True`.
- Alembic pour les migrations, une configuration par service.
- Pydantic 2 et `pydantic-settings`.
- `PyJWT` (algorithme HS256) et la bibliothèque `bcrypt` directement (pas de passlib).
- `python-multipart` et `Pillow` (auth-service), `boto3` (auth-service uniquement).
- Tests : `pytest` et `httpx` (`TestClient`).
- Versions **figées** dans `requirements.txt` (dernières versions stables au moment du développement).

## 5. Variables d'environnement

| Variable | Service | Rôle | Défaut |
| --- | --- | --- | --- |
| `DATABASE_URL` | les deux | URL SQLAlchemy, par exemple `postgresql+psycopg://app:pwd@postgres:5432/auth_db` | obligatoire |
| `JWT_SECRET` | les deux | Secret partagé, **au moins 32 caractères**, le service refuse de démarrer sinon | obligatoire |
| `JWT_EXPIRE_MINUTES` | auth-service | Durée de validité du jeton | `60` |
| `INSTANCE_ID` | les deux | Matricule de l'étudiant, renvoyé par `/health` | `local` |
| `CORS_ORIGINS` | les deux | Origines autorisées, séparées par des virgules | `http://localhost:8080,http://localhost:3000` |
| `LOG_LEVEL` | les deux | Niveau des journaux | `INFO` |
| `PORT` | les deux | Port d'écoute | `8000` |
| `DB_POOL_SIZE` | les deux | Taille du pool de connexions | `5` |
| `RUN_MIGRATIONS` | les deux | Lancer `alembic upgrade head` au démarrage | `true` |
| `STORAGE_BACKEND` | auth-service | `local` ou `s3` | `local` |
| `STORAGE_LOCAL_DIR` | auth-service | Dossier des photos en mode `local` | `/data/photos` |
| `S3_BUCKET` | auth-service | Bucket des photos (mode `s3`) | |
| `S3_REGION` | auth-service | Région du bucket | |
| `S3_ENDPOINT_URL` | auth-service | Endpoint personnalisé, facultatif (MinIO) | |
| `GRADE_WEIGHTS` | grades-service | Pondération `CC,TP,SN`, la somme doit valoir 1 | `0.3,0.2,0.5` |
| `BCRYPT_ROUNDS` | seed | Coût bcrypt des mots de passe seedés (4 à 14), option `--bcrypt-rounds` | `10` |
| `AUTH_UPSTREAM` | passerelle | Adresse d'`auth-service` pour Nginx | `http://auth-service:8000` |
| `GRADES_UPSTREAM` | passerelle | Adresse de `grades-service` pour Nginx | `http://grades-service:8000` |
| `FRONTEND_UPSTREAM` | passerelle | Adresse du frontend pour Nginx (tout ce qui n'est pas `/api/...`) | `http://frontend:8080` |
| `AUTH_API_URL` | frontend | Adresse de l'API d'authentification écrite dans `config.json` au démarrage du conteneur | `/api/auth` |
| `GRADES_API_URL` | frontend | Adresse de l'API des notes écrite dans `config.json` | `/api/grades` |

Fournis un `.env.example` à la racine avec des valeurs de développement (un faux `JWT_SECRET` long, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `SEED_PASSWORD`) et, en commentaire, le bloc du mode S3 avec MinIO (`STORAGE_BACKEND=s3`, `S3_*`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). Le vrai `.env` est dans `.gitignore`. Le mode S3 local se règle dans `.env` (lu par `env_file`), pas par un fichier compose séparé.

## 6. Modèle de données

Deux bases distinctes, créées par `docker/postgres/init-databases.sh` : `auth_db` et `grades_db`. Les tables sont créées **uniquement par Alembic**.

### auth_db

Table `users` :

| Colonne | Type | Remarques |
| --- | --- | --- |
| `id` | entier auto-incrémenté | clé primaire |
| `matricule` | texte | unique, indexé, en minuscules |
| `full_name` | texte | non nul |
| `password_hash` | texte | hash bcrypt, non nul |
| `photo_key` | texte | clé de la photo dans le stockage, nullable |
| `photo_content_type` | texte | `image/jpeg` ou `image/png`, nullable |
| `created_at`, `updated_at` | horodatage UTC | |

### grades_db

Table `courses` :

| Colonne | Type | Remarques |
| --- | --- | --- |
| `id` | entier auto-incrémenté | clé primaire |
| `code` | texte | unique, par exemple `INF4107` |
| `title` | texte | non nul |
| `credits` | entier | strictement positif |
| `semester` | texte | par exemple `S1` |

Table `grades` :

| Colonne | Type | Remarques |
| --- | --- | --- |
| `id` | entier auto-incrémenté | clé primaire |
| `matricule` | texte | indexé, en minuscules |
| `course_id` | entier | clé étrangère vers `courses.id` |
| `cc`, `tp`, `sn` | `Numeric(4,2)` | **nullables**, contrainte : entre 0 et 20 |

Contrainte d'unicité sur (`matricule`, `course_id`).

Reste sur des types SQLAlchemy **génériques** (pas de fonctionnalité propre à PostgreSQL) pour que les tests puissent tourner sur SQLite en mémoire.

Format du matricule : `^\d{2}u\d{4}$` après passage en minuscules, par exemple `20u2671`.

## 7. auth-service (préfixe `/api/auth`)

Documentation : `/api/auth/docs` et `/api/auth/openapi.json` (à configurer explicitement dans `FastAPI(...)`).

### `POST /api/auth/login`

Corps JSON : `{"matricule": "20u2671", "password": "..."}`. Le matricule est nettoyé (espaces) et passé en minuscules, un format invalide donne un 422.

- **200** : `{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 3600}`
- **401** : `{"detail": "Matricule ou mot de passe incorrect"}`, **identique** pour un matricule inconnu et un mauvais mot de passe. Quand le matricule est inconnu, un hash bcrypt factice (coût 10, comme le seed) est quand même vérifié, pour que les deux cas durent aussi longtemps.

JWT : HS256, signé avec `JWT_SECRET`, claims `sub` (matricule), `name` (nom complet), `iat`, `exp`.

### `GET /api/auth/me` (jeton requis)

- **200** : `{"matricule": "20u2671", "full_name": "...", "photo_url": null}`
- **401** : `{"detail": "Non authentifié"}` avec l'en-tête `WWW-Authenticate: Bearer`.

Le jeton se lit dans `Authorization: Bearer <jwt>`. La dépendance `get_current_user` relit l'utilisateur en base. Si l'utilisateur n'existe plus, 401.

`photo_url` vaut :

- `null` s'il n'y a pas de photo ;
- `"/api/auth/me/photo"` en mode `local` (le frontend la récupère avec l'en-tête `Authorization`, puis affiche le blob) ;
- une **URL signée S3** valable 15 minutes en mode `s3` : celle de la miniature `photos/thumb/<matricule>.jpg` si elle existe, sinon celle de l'original.

### `PUT /api/auth/me/photo` (jeton requis)

Requête `multipart/form-data`, champ `file`. Retourne la même réponse que `GET /api/auth/me`.

1. Lire le fichier avec une limite de **2 Mio** : au-delà, **413** `{"detail": "Photo trop volumineuse (2 Mo maximum)"}`.
2. Ouvrir l'image avec **Pillow** pour la valider. Le format doit être JPEG ou PNG, sinon **415** `{"detail": "Format non supporté (JPEG ou PNG uniquement)"}`. Dimensions maximales 4000 × 4000, sinon 422. Le type de contenu est déduit du format détecté par Pillow, **jamais** de l'en-tête envoyé par le client.
3. Enregistrer l'original **tel quel** (sans redimensionnement) sous la clé `photos/original/<matricule>`, avec son type de contenu.
4. Supprimer l'ancienne miniature `photos/thumb/<matricule>.jpg` si elle existe, pour ne pas afficher une ancienne photo. Une fonction serverless la recréera plus tard.
5. Mettre à jour `photo_key` et `photo_content_type`.

### `GET /api/auth/me/photo` (jeton requis)

- Mode `local` : renvoie les octets de l'image avec le bon `Content-Type`.
- Mode `s3` : redirection **307** vers l'URL signée.
- Sans photo : **404** `{"detail": "Aucune photo de profil"}`.

### `GET /api/auth/health` (public)

- **200** : `{"status": "ok", "service": "auth-service", "instance": "<INSTANCE_ID>"}` si la base répond à un `SELECT 1`.
- **503** : `{"status": "degraded", "service": "auth-service", "instance": "<INSTANCE_ID>"}` sinon.

## 8. grades-service (préfixe `/api/grades`)

Documentation : `/api/grades/docs` et `/api/grades/openapi.json`.

Ce service ne connaît pas la table des utilisateurs. Il vérifie le JWT localement (HS256, `JWT_SECRET`), refuse un jeton absent, invalide ou expiré (401 `{"detail": "Non authentifié"}`), et utilise le claim `sub` comme matricule.

### `GET /api/grades/me/grades?semester=S1` (jeton requis)

`semester` : motif `^S[1-9]$`, `S1` par défaut, sinon 422. Une seule requête SQL (jointure `grades` et `courses`, filtrée par matricule et semestre), triée par code de matière.

Réponse **200** :

```json
{
  "matricule": "20u2671",
  "semester": "S1",
  "courses": [
    {
      "code": "INF4101",
      "title": "Génie logiciel avancé",
      "credits": 4,
      "cc": 14.5,
      "tp": null,
      "sn": 12.0,
      "average": null
    }
  ]
}
```

- `cc`, `tp`, `sn` sont des nombres ou `null` si la note est absente.
- `average` = `w_cc × cc + w_tp × tp + w_sn × sn` avec les poids de `GRADE_WEIGHTS`, **uniquement si les trois notes existent**, sinon `null`. Calcul avec `Decimal`, arrondi à 2 décimales.
- `GRADE_WEIGHTS` est validé au démarrage (trois nombres positifs de somme 1, sinon le service refuse de démarrer).
- Si l'étudiant n'a aucune note pour ce semestre : `courses` vaut `[]`, la réponse reste **200**.

### `GET /api/grades/health` (public)

Même format que pour auth-service, avec `"service": "grades-service"`.

## 9. Stockage des photos (`auth-service/app/storage.py`)

Une petite interface avec deux implémentations choisies par `STORAGE_BACKEND` :

```python
class Storage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def url(self, key: str, expires: int = 900) -> str | None: ...
```

- **LocalStorage** : fichiers sous `STORAGE_LOCAL_DIR`, en créant les sous-dossiers. Protège contre les clés qui sortent du dossier (`..`). `url()` renvoie `None`.
- **S3Storage** : `boto3.client("s3", region_name=S3_REGION, endpoint_url=S3_ENDPOINT_URL, config=Config(signature_version="s3v4"))`, sans clé écrite en dur. La signature **SigV4** est imposée : avec un endpoint personnalisé, boto3 signerait sinon en SigV2, refusée par les régions AWS récentes. `url()` renvoie une URL signée `get_object`. `exists()` utilise `head_object`. `get()` d'une clé absente lève `FileNotFoundError`, `delete()` d'une clé absente n'est pas une erreur.
- `STORAGE_BACKEND=s3` sans `S3_BUCKET` : le service refuse de démarrer.

Les clés sont `photos/original/<matricule>` et `photos/thumb/<matricule>.jpg`.

## 10. Passerelle Nginx et docker-compose

### `docker/nginx/default.conf.template`

Modèle traité au démarrage par l'image Nginx (`envsubst`, fichier monté dans `/etc/nginx/templates/`). Rien de propre à Docker n'est écrit en dur : le serveur DNS vient de `/etc/resolv.conf` (variable `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`, l'image fournit alors `NGINX_LOCAL_RESOLVERS`), et les adresses des services viennent de `AUTH_UPSTREAM`, `GRADES_UPSTREAM` et `FRONTEND_UPSTREAM`. Cela fonctionne donc aussi sous Kubernetes ou ECS.

```nginx
resolver ${NGINX_LOCAL_RESOLVERS} valid=10s;

server {
    listen 80;
    client_max_body_size 3m;   # sinon les photos de 2 Mo sont refusées (défaut : 1 Mo)

    location /api/auth/ {
        set $auth_upstream ${AUTH_UPSTREAM};
        proxy_pass $auth_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/grades/ {
        set $grades_upstream ${GRADES_UPSTREAM};
        proxy_pass $grades_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        set $frontend_upstream ${FRONTEND_UPSTREAM};
        proxy_pass $frontend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_pass` avec une variable et sans chemin transmet l'URL **inchangée** : c'est voulu, car les services portent déjà leur préfixe. `location /` envoie tout le reste (pages, `config.json`, ressources statiques, page 404) au frontend. L'adresse est résolue à chaque requête : la passerelle démarre même si un service n'est pas encore prêt et suit un service dont l'IP change.

### `docker-compose.yml`

Services :

- `postgres` : `postgres:16-alpine`, volume nommé, `healthcheck` avec `pg_isready`, montage de `docker/postgres/init-databases.sh` dans `/docker-entrypoint-initdb.d/`. Ce script crée `auth_db` et `grades_db` (avec `ON_ERROR_STOP=1`).
- `auth-service` et `grades-service` : build local, variables lues depuis `.env`, `DATABASE_URL` construit à partir de `POSTGRES_USER` et `POSTGRES_PASSWORD`, `depends_on: postgres` avec `condition: service_healthy`, `healthcheck` sur `/health` (avec `python -c` et `urllib`, l'image slim n'a pas `curl`). `auth-service` monte un volume nommé sur `/data/photos`.
- `gateway` : `nginx:1.27-alpine`, port hôte `8080` vers 80, monte `default.conf.template` dans `/etc/nginx/templates/`, reçoit `NGINX_ENTRYPOINT_LOCAL_RESOLVERS`, `AUTH_UPSTREAM`, `GRADES_UPSTREAM` et `FRONTEND_UPSTREAM`, dépend des trois services.
- `frontend` : build `./frontend` (Node pour construire, puis `nginxinc/nginx-unprivileged` pour servir `out/`, non-root, port 8080 du conteneur), aucun port publié sur la machine, `healthcheck` sur `/healthz`. Il reçoit `AUTH_API_URL` et `GRADES_API_URL`, qu'un script d'entrée écrit dans `config.json` à chaque démarrage (sans reconstruire l'image).
- `seed` : profil `tools` (ne démarre pas avec `up`), voir section 11.
- `minio` et `minio-init` : profil `s3` (étape 7). `minio-init` crée le bucket avec le client `mc` déjà présent dans l'image `minio/minio` (l'image `minio/mc` n'est pas toujours téléchargeable).

Le fichier commence par `name: inf4107-backend` : sans cela, le projet s'appelle « backend » (nom du dossier) et peut réutiliser le volume `backend_pgdata` d'un autre projet, ce qui empêche la création des bases.

`Makefile` : `up` (`docker compose up -d --build`), `down`, `seed` (reconstruit l'image du seed puis la lance : `docker compose run` ne reconstruit jamais une image existante), `venv` (crée `.venv/` et installe les dépendances de test), `test` (tests des deux services, puis `test-front`), `test-front` (ESLint et tests Vitest du frontend, `npm ci` d'abord si `node_modules` manque), `smoke` (`scripts/smoke_test.py`, avec `SEED_PASSWORD` lu dans `.env`). `test` et `smoke` utilisent `.venv/bin/python` s'il existe, sinon `python3` (variable `PYTHON`) : `python` n'existe pas sur toutes les machines.

### Dockerfile d'un service (exemple à adapter)

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -r -u 10001 app && mkdir -p /data/photos && chown -R app /app /data
USER app
EXPOSE 8000
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then alembic upgrade head; fi && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

## 11. Seed (`seed/`)

Le seed est une **image Docker autonome** pour pouvoir être lancée n'importe où (ordinateur, VM, tâche de conteneur) en lui donnant seulement des URL de bases. Il utilise `psycopg` en SQL direct (il n'importe pas le code des services) et suppose que les migrations ont déjà été appliquées.

Lancement local : `docker compose --profile tools run --rm seed --students 2000 --my-matricule 20u2671`

| Option ou variable | Rôle |
| --- | --- |
| `AUTH_DATABASE_URL`, `GRADES_DATABASE_URL` | URL des deux bases |
| `--students N` | Nombre d'étudiants fictifs, 2000 par défaut |
| `--my-matricule` | Matricule de l'étudiant qui déploie : son compte est créé en plus |
| `--password` ou `SEED_PASSWORD` | Mot de passe de tous les comptes (**aucune valeur par défaut dans le code**) |
| `--seed N` | Graine aléatoire pour des données reproductibles, 42 par défaut |
| `--bcrypt-rounds N` ou `BCRYPT_ROUNDS` | Coût bcrypt (4 à 14), **10** par défaut |
| `--reset` | Vide les tables avant d'insérer ; sans cette option, les insertions ignorent les doublons |

Contenu :

- **Étudiants** : matricules `20u0001` à `20uNNNN`, plus `--my-matricule` s'il n'en fait pas partie. Noms fictifs tirés de petites listes de prénoms et de noms inventés.
- **Hash du mot de passe calculé une seule fois** puis réutilisé pour tous les comptes : bcrypt est lent, 2000 hachages prendraient plusieurs minutes. Le coût (10 par défaut, au lieu des 12 de la bibliothèque) détermine le travail CPU de **chaque connexion** : il est donc réglable, et le test de charge reste tenable avec un petit budget. Le coût est écrit dans le hash : pour le changer, relancer le seed avec `--reset`. Le hash factice d'`auth-service` (matricule inconnu, section 7) a le même coût 10, pour que les deux échecs de login durent aussi longtemps.
- **10 matières de S1** (30 crédits au total) :

| Code | Intitulé | Crédits |
| --- | --- | --- |
| INF4101 | Génie logiciel avancé | 4 |
| INF4102 | Bases de données avancées | 4 |
| INF4103 | Réseaux et sécurité | 3 |
| INF4104 | Systèmes distribués | 3 |
| INF4105 | Intelligence artificielle | 3 |
| INF4106 | Analyse de données | 3 |
| INF4107 | Cloud computing | 4 |
| INF4108 | Architecture logicielle | 3 |
| INF4109 | Méthodologie de recherche | 2 |
| INF4110 | Anglais technique | 1 |

- **Notes** : pour chaque étudiant et chaque matière, CC, TP et SN suivent une loi normale centrée autour de 11-12 avec un écart-type d'environ 3, bornée entre 0 et 20, arrondie à 0,25. Environ 3 % des notes sont absentes (`NULL`) au hasard.
- Pour l'étudiant `--my-matricule` : au moins 8 matières avec les trois notes, et **une matière avec un TP absent**, afin que la démonstration montre le cas « — ».
- Insertions par lots (`executemany` ou `COPY`).

## 12. Étapes et critères d'acceptation

### Étape 1 – Squelette

Arborescence, `.gitignore`, `.env.example`, `Makefile`, `docker-compose.yml` (postgres et gateway seulement, les services sont ajoutés ensuite), `docker/nginx/default.conf.template`, `docker/postgres/init-databases.sh`, `README.md` de départ.

Validation : `docker compose up -d` démarre PostgreSQL (healthy) et la passerelle ; `curl http://localhost:8080/` répond (à ce stade un texte provisoire ; depuis l'ajout du frontend, la page d'accueil) ; les bases `auth_db` et `grades_db` existent.

### Étape 2 – auth-service (connexion, profil, health)

`config.py`, `db.py` (avec attente de la base), modèles, migration Alembic, `security.py`, routes `login`, `me`, `health`, Dockerfile, tests.

Validation : tests verts (`make test`). Tests attendus : login réussi, 401 identique pour un matricule inconnu et un mauvais mot de passe, 422 sur format de matricule invalide, `me` avec jeton valide, expiré, falsifié et absent, `health` en 200. Le service démarre dans compose et répond via la passerelle sur `/api/auth/health`.

### Étape 3 – grades-service

Même structure, vérification JWT locale, migration Alembic, route des notes avec le calcul de la moyenne, `health`, Dockerfile, tests.

Validation : tests verts. Tests attendus : jeton absent ou invalide, notes avec les trois valeurs (moyenne calculée), note absente (moyenne `null`), semestre sans notes (`[]`), semestre invalide (422), `GRADE_WEIGHTS` invalide (échec au démarrage), un étudiant ne voit **jamais** les notes d'un autre. Le service répond via la passerelle sur `/api/grades/health`.

### Étape 4 – Seed

Image `seed/`, profil `tools` dans compose.

Validation :

```bash
make up
make seed        # --students 2000 --my-matricule 20u2671
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"matricule":"20u2671","password":"<SEED_PASSWORD>"}' | python -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -s localhost:8080/api/auth/me -H "Authorization: Bearer $TOKEN"
curl -s "localhost:8080/api/grades/me/grades?semester=S1" -H "Authorization: Bearer $TOKEN"
```

La réponse contient 10 matières, dont une avec un TP absent.

### Étape 5 – Photo de profil (stockage local)

`storage.py` (`LocalStorage` et interface), routes `PUT /me/photo` et `GET /me/photo`, `photo_url` dans `/me`, tests.

Validation : tests verts. Tests attendus : envoi d'un JPEG et d'un PNG valides, refus d'un GIF ou d'un fichier texte renommé en `.jpg` (415), refus au-dessus de 2 Mio (413), remplacement d'une photo, `GET /me/photo` renvoie les octets avec le bon type, 404 sans photo. L'envoi d'une photo de 2 Mo fonctionne **à travers la passerelle** (taille limite Nginx).

### Étape 6 – Test de bout en bout et README

`scripts/smoke_test.py` (avec `httpx`, URL de la passerelle et matricule en arguments) : health des deux services, login, `me`, notes, envoi d'une photo, relecture. Le mot de passe vient de `--password` ou de `SEED_PASSWORD`. Il affiche un résultat clair par étape et un code de sortie non nul en cas d'échec. En mode S3, la relecture de la photo accepte la redirection 307 (l'hôte `minio` n'est pas joignable depuis la machine hôte). Dépendance : `httpx` seul (`scripts/requirements.txt`), la photo de test est fabriquée à la main.

`README.md` complet en français : lancement local en quatre commandes (`cp .env.example .env`, `make up`, `make seed`, `make venv && make smoke`), variables d'environnement, tests, seed, schéma des routes, section « Décisions ».

Validation : `make up && make seed && make smoke` passe de bout en bout sur une machine propre.

### Étapes suivantes (à ne faire que sur demande de l'utilisateur)

**Étape 7 – S3 et fonction de miniature.**

- `S3Storage` (signature SigV4, section 9), plus un profil compose `s3` avec **MinIO** et la création automatique du bucket, pour tester le mode S3 en local. L'URL signée MinIO contient l'hôte `minio` : pour l'ouvrir depuis la machine hôte, ajouter `127.0.0.1 minio` à `/etc/hosts` (à documenter dans le `README`). `photo_url` et `GET /me/photo` (307) pointent vers la miniature si elle existe, sinon vers l'original.
- `lambda/thumbnailer/` : `handler.py` avec `lambda_handler(event, context)`. Pour chaque enregistrement d'un événement S3 dont la clé commence par `photos/original/`, la fonction télécharge l'objet, le recadre au centre en carré (`ImageOps.fit`), le redimensionne en 128 × 128 (taille réglable par `THUMB_SIZE`), l'encode en JPEG (qualité 85) et l'écrit sous `photos/thumb/<matricule>.jpg`. Elle ignore toute autre clé pour éviter une boucle. Fournir `requirements.txt` (Pillow) et un `Dockerfile` d'image Lambda facultatif. Documenter dans le `README` que Pillow doit être empaqueté pour Linux (couche ou image de conteneur).

**Étape 8 – Charge et contrôle.**

- `loadtest/k6.js` : montée jusqu'à 200 utilisateurs virtuels en 2 minutes, puis palier de 3 minutes. Chaque utilisateur se connecte **une seule fois** avec un matricule tiré au hasard dans la plage du seed, puis consulte ses notes une fois par seconde en réutilisant son jeton (il se reconnecte seulement si le jeton est refusé) : un login par itération rendrait le test dominé par bcrypt. Seuils : `http_req_duration` p(95) < 800 ms et moins de 1 % d'erreurs. L'URL de base (`BASE_URL`) et le mot de passe (`PASSWORD`, jamais écrit dans le script) sont des paramètres. Ordre de grandeur mesuré sur un PC portable, une seule instance par service, seed en coût bcrypt 10 : p(95) d'environ 260 ms à 200 utilisateurs.
- `teacher/check_instances.py` (pour l'enseignant, **hors du dépôt remis aux étudiants**) : lit une liste de matricules (fichier texte) et vérifie pour chacun la résolution DNS de `<matricule>.inf4107.site`, la validité du certificat HTTPS, la page d'accueil, et `/api/auth/health` et `/api/grades/health` avec le champ `instance` égal au matricule. Affiche un tableau et un code de sortie non nul si une instance échoue. Si le DNS ne résout pas, les autres vérifications sont ignorées. Il n'est pas décrit dans le `README` des étudiants, mais dans `teacher/README.md`.

## 13. Qualité attendue

- Les tests tournent **sans Docker ni PostgreSQL** (SQLite en mémoire, dépendance de base surchargée) et sont rapides.
- Pas de secret dans le dépôt, aucun `print` de données sensibles, les mots de passe ne sont jamais journalisés.
- Les messages d'erreur ne révèlent pas si un matricule existe.
- Code formaté de façon cohérente (mets une configuration `ruff` minimale dans chaque service) et sans code mort.

## 14. Hors périmètre

À ne **pas** construire : rôles enseignant ou admin, saisie ou modification de notes via l'API, inscription ou création de compte par l'API, réinitialisation du mot de passe, relevé PDF, e-mails, file de messages, cache Redis, Kubernetes, fichiers d'infrastructure as code. Le frontend est décrit séparément (FRONTEND_SPEC.md). Les étudiants construiront eux-mêmes l'infrastructure.
