#!/bin/bash
cd /Users/mikaatlan/Desktop/avis-doctolib/apps/reputy-admin
export PATH="/Users/mikaatlan/Desktop/avis-doctolib/node_modules/.bin:$PATH"
which next 2>&1
next build 2>&1
echo "EXIT_CODE=$?"
