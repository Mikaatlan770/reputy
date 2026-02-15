#!/usr/bin/env bash
set -euo pipefail
echo "=== reputy-web .env files ==="
ls -la /Users/mikaatlan/Desktop/avis-doctolib/apps/reputy-web/.env* 2>/dev/null || echo "(none)"
echo ""
echo "=== reputy-admin .env files ==="
ls -la /Users/mikaatlan/Desktop/avis-doctolib/apps/reputy-admin/.env* 2>/dev/null || echo "(none)"
echo ""
echo "=== Check ports ==="
lsof -i :3001 -sTCP:LISTEN 2>/dev/null | head -5 || echo "3001: not listening"
lsof -i :3002 -sTCP:LISTEN 2>/dev/null | head -5 || echo "3002: not listening"
lsof -i :8787 -sTCP:LISTEN 2>/dev/null | head -5 || echo "8787: not listening"
echo ""
echo "=== Quick API test ==="
curl -s -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cabinet.boissenart@gmail.com","password":"test"}' \
  2>/dev/null | head -c 500 || echo "(curl failed)"
echo ""
echo "=== Done ==="
