#!/bin/bash
set -e
cd /Users/mikaatlan/Desktop/avis-doctolib
git add apps/backend/lib/repositories/review.repo.js
git add apps/reputy-admin/src/lib/reviews/use-reviews.ts
git add apps/reputy-admin/src/app/team/page.tsx
git add apps/reputy-admin/src/app/locations/page.tsx
git add apps/backend/server.js
git status
git commit -m "feat: stats avancees analytics + types + confirmations UI + suppression etablissement"
echo "DONE"
