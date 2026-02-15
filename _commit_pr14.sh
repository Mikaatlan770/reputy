#!/bin/bash
cd /Users/mikaatlan/Desktop/avis-doctolib
git add -A
git status --short
git commit -m "feat(dashboard): banniere informative plan Bronze quotas 0/0

- Detecte plan Bronze (smsTotal+emailTotal+aiTotal = 0)
- Affiche bandeau amber avec message + CTA vers /billing
- Plans Argent/Or/Platinum: aucun changement
- Guard safe si creditsComputed undefined"
echo "--- COMMIT PR-14 DONE ---"
