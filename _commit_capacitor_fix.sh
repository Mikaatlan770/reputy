#!/bin/bash
cd /Users/mikaatlan/Desktop/avis-doctolib
git add -A
git status --short
git commit -m "fix: isoler Capacitor du build Next.js + callback auth propre

- secure-token.ts: import Capacitor via new Function() pour eviter
  Module not found au build web
- auth/callback/page.tsx: nettoye debug, spinner minimal
- Resout le probleme de login persistant (cache .next stale)"
echo "--- COMMIT DONE ---"
