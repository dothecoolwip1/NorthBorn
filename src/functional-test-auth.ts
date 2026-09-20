import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export type FunctionalTestPersona = 'manager' | 'operator' | 'client'
export type FunctionalTestInternalRole = 'owner' | 'admin' | 'supervisor' | 'dispatcher' | 'safety' | 'mechanic' | 'accounting'

export const FUNCTIONAL_TEST_INTERNAL_ROLES: Record<FunctionalTestInternalRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  supervisor: 'Supervisor',
  dispatcher: 'Dispatcher',
  safety: 'Safety',
  mechanic: 'Mechanic',
  accounting: 'Accounting',
}

export const FUNCTIONAL_TEST_USERS: Record<FunctionalTestPersona, { email: string; label: string }> = {
  manager: { email: 'manager@test.com', label: 'Manager' },
  operator: { email: 'operator@test.com', label: 'Operator' },
  client: { email: 'client@test.com', label: 'Client' },
}

export function deriveFunctionalTestPassword(enteredPassword: string) {
  const base = enteredPassword.trim()
  const capitalized = base ? `${base[0].toUpperCase()}${base.slice(1)}` : base
  return `${capitalized}${base}2026!`
}

export function personaFromSession(session: Session | null): FunctionalTestPersona | null {
  const email = session?.user.email?.toLowerCase() || ''
  const matched = (Object.entries(FUNCTIONAL_TEST_USERS) as [FunctionalTestPersona, { email: string; label: string }][]) 
    .find(([, value]) => value.email === email)
  return matched?.[0] ?? null
}

export function isFunctionalTestSession(session: Session | null) {
  return personaFromSession(session) !== null
}

export async function restoreFunctionalTestWorkspace() {
  const result = await (supabase as any).rpc('restore_my_northborn_test_workspace')
  if (result.error) throw result.error
  return result.data
}

async function signInPersona(persona: FunctionalTestPersona, enteredPassword = 'admin') {
  const account = FUNCTIONAL_TEST_USERS[persona]
  const result = await supabase.auth.signInWithPassword({
    email: account.email,
    password: deriveFunctionalTestPassword(enteredPassword),
  })
  if (!result.error && result.data.session) await restoreFunctionalTestWorkspace()
  return result
}

async function bootstrapFunctionalTestUsers(username: string, password: string) {
  const response = await supabase.functions.invoke('initialize-functional-test-users', {
    body: {
      username,
      password,
      testPassword: deriveFunctionalTestPassword(password),
    },
  })
  if (response.error) throw response.error
  if (!response.data?.ok) throw new Error(response.data?.error || 'Unable to prepare the Northborn test accounts.')
}

export async function signInFunctionalTestAdmin(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedPassword = password.toLowerCase()
  if (normalizedUsername !== 'admin' || normalizedPassword !== 'admin') {
    throw new Error('Invalid login credentials')
  }

  let result = await signInPersona('manager', password)

  if (result.error) {
    const message = result.error.message.toLowerCase()
    if (!message.includes('invalid login') && !message.includes('email not confirmed')) throw result.error

    await bootstrapFunctionalTestUsers(normalizedUsername, normalizedPassword)
    result = await signInPersona('manager', password)
  }

  if (result.error) throw result.error
  return result.data.session
}

export async function switchFunctionalTestPersona(persona: FunctionalTestPersona) {
  const result = await signInPersona(persona)
  if (result.error) throw result.error
  return result.data.session
}

export async function switchFunctionalTestInternalRole(roleKey: FunctionalTestInternalRole) {
  const result = await (supabase as any).rpc('set_my_northborn_test_role', { _role_key: roleKey })
  if (result.error) throw result.error
  return result.data as string
}

export function clearFunctionalTestUnlock() {
  // Kept for compatibility with existing sign-out code. No local unlock is required.
}
