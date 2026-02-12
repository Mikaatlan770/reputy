#!/bin/bash
cd /Users/mikaatlan/Desktop/avis-doctolib
git add -A
git status
git commit -m "fix: corrections post-test PR-8e — login direct, switch org, permissions granulaires

- Login: suppression org-picker, redirection directe vers admin (1er org actif)
- Switch org topbar: getAuthUser utilise orgId de la session active
- Plan: getDefaultPlan retourne bronze (plus basic)
- Settings: planLabels map pour affichage correct (Bronze/Silver/Gold)
- Roles FR: Propriétaire, Directeur/Directrice, Secrétaire (topbar+team+locations)
- Migration 012: colonne permissions_json sur memberships
- Backend: permissions granulaires sur invite/team/memberships/updateRole
- Frontend team: sélection permissions (avis, stats, SMS, facturation)
- Auth-context: expose currentPermissions
- Sidebar: filtre navigation selon permissions du membre"
