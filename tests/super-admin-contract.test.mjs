import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('super admin stays server-authorized and routed', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../src/SuperAdminPage.tsx', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/super-admin/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260929145000_platform_super_admin_foundation.sql', import.meta.url), 'utf8')

  assert.match(main, /SuperAdminPage/)
  assert.match(main, /link_platform_admin_identity/)
  assert.match(page, /functions\.invoke\('super-admin'/)
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(edge, /link_platform_admin_identity/)
  assert.match(migration, /admin@northborn\.link/)
  assert.match(migration, /enable row level security/)
})

// Verification branch sentinel.
