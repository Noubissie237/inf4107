# Outils enseignant

**Ce dossier ne doit pas être distribué aux étudiants** (retirez `teacher/` du dépôt qui leur
est donné).

## check_instances.py : contrôle des déploiements

```bash
python3 teacher/check_instances.py matricules.txt     # un matricule par ligne
```

Pour chaque `<matricule>.inf4107.site`, le script vérifie la résolution DNS, la validité du
certificat HTTPS (chaîne, date, nom d'hôte), la page d'accueil, puis `/api/auth/health` et
`/api/grades/health` (avec `instance` égal au matricule). Il affiche un tableau (`OK`,
`ÉCHEC` ou `-` si l'étape n'a pas été tentée), détaille les erreurs et se termine avec un code
non nul si une instance échoue.

Options : `--domain` (défaut `inf4107.site`), `--timeout` (10 s), `--workers` (10).
Dépendance : `httpx` (`make venv` à la racine l'installe, puis `.venv/bin/python teacher/...`).

Si le DNS ne résout pas, les autres vérifications sont ignorées (`-`). Une erreur réseau, TLS
ou de contenu compte comme un échec de l'étape concernée. Les matricules sont mis en
minuscules et dédoublonnés ; une ligne invalide arrête le script avant toute requête.
