# 🚀 Production — Démarrage & Monitoring

> P0.2 — Anti-crash & Process Stability

## Prérequis

- Node.js >= 18
- PM2 installé globalement : `npm install -g pm2`
- Variables d'environnement configurées (voir `apps/backend/env.example`)

## Démarrage en production

```bash
# 1. Installer les dépendances
npm run install:all

# 2. Configurer les variables d'environnement
#    Copier apps/backend/env.example → apps/backend/.env
#    Remplir TOUTES les valeurs (pas de fallback en production)

# 3. Créer le dossier de logs
mkdir -p logs

# 4. Démarrer avec PM2
npm run pm2:start

# 5. Vérifier le statut
npm run pm2:status
```

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run pm2:start` | Démarrer le backend en production avec auto-restart |
| `npm run pm2:dev` | Démarrer en mode développement avec PM2 |
| `npm run pm2:logs` | Voir les 100 dernières lignes de logs |
| `npm run pm2:stop` | Arrêter le backend |
| `npm run pm2:restart` | Redémarrer le backend |
| `npm run pm2:status` | Statut de tous les processus PM2 |

## Où lire les logs

```bash
# Logs temps réel
pm2 logs reputy-backend

# Fichiers de log (créés par PM2)
cat logs/reputy-backend-out.log     # stdout (JSON structuré)
cat logs/reputy-backend-error.log   # stderr (erreurs fatales)

# Filtrer les erreurs fatales
grep '"level":"fatal"' logs/reputy-backend-out.log
grep UNCAUGHT logs/reputy-backend-error.log
```

## Comportement en cas de crash

1. **Erreur non capturée** → log `fatal` en JSON (stderr) → graceful shutdown (fermeture HTTP + DB) → `exit(1)`
2. **PM2 détecte l'exit** → auto-restart après 3 secondes
3. **Limite** : max 15 restarts consécutifs (protection anti-boucle infinie)
4. **Mémoire** : restart automatique si > 512 MB

### Séquence de shutdown

```
uncaughtException / unhandledRejection / SIGTERM / SIGINT
  → logger.logFatal (JSON structuré vers stderr)
  → server.close() (arrêt nouvelles connexions HTTP)
  → db.closeDb() (fermeture SQLite propre)
  → process.exit(1)  (ou exit(0) pour SIGTERM/SIGINT)
  → PM2 → auto-restart après 3s
```

## Tester le mécanisme de crash (dev)

```bash
# 1. Démarrer le backend en dev
cd apps/backend && USE_SQLITE=1 node server.js

# 2. Ctrl+C → doit afficher :
#    [REPUTY][SHUTDOWN] Graceful shutdown initiated: SIGINT
#    [REPUTY-DB] Connection closed
#    (exit code 0)

# 3. Avec PM2 — vérifier auto-restart :
npm run pm2:dev
pm2 logs reputy-backend    # Observer les logs
pm2 status                 # Voir compteur de restarts
```

## Signaux système

| Signal | Comportement |
|--------|-------------|
| `SIGTERM` | Graceful shutdown → exit(0) — envoyé par PM2/Docker pour arrêt propre |
| `SIGINT` | Graceful shutdown → exit(0) — Ctrl+C en terminal |
| `uncaughtException` | Log fatal → graceful shutdown → exit(1) → PM2 auto-restart |
| `unhandledRejection` | Log fatal → graceful shutdown → exit(1) → PM2 auto-restart |

## Configuration PM2

Le fichier `ecosystem.config.cjs` à la racine contient toute la configuration PM2.
Les secrets ne sont PAS dans ce fichier — ils doivent être dans le `.env` du backend ou les variables d'environnement système.

```bash
# Voir la config
cat ecosystem.config.cjs
```
