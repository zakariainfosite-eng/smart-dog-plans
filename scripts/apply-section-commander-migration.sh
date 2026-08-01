#!/usr/bin/env bash
# Apply section commander columns to the linked Supabase project.
# Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase db query --linked --yes -f supabase/migrations/20260726180000_section_commander_fields.sql
echo "Section commander migration applied."
