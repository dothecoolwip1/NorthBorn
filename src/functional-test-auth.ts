import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export type FunctionalTestPersona = 'manager' | 'operator' | 'client'

export const FUNCTIONAL_TEST_USERS: Record<FunctionalTestPersona, { email: string; label: string }> = {
  manager: { email: 'manager@test.com', label: 'Manager' },
  operator: { email: 'operator@test.com', label: 'Operator' },
  client: { email: 'client@test.com', label: 'Client' },
}

const TEST_UNLOCK_KEY = 'northborn_functional_test_unlock'

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

async function signInPersona(persona: FunctionalTestPersona, enteredPassword: string) {
  const account = FUNCTIONAL_TEST_USERS[persona]
  return supabase.auth.signInWithPassword({
    email: account.email,
    password: deriveFunctionalTestPassword(enteredPassword),
  })
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

  sessionStorage.setItem(TEST_UNLOCK_KEY, password)
  return result.data.session
}

export async function switchFunctionalTestPersona(persona: FunctionalTestPersona) {
  const password = sessionStorage.getItem(TEST_UNLOCK_KEY)
  if (!password) throw new Error('Sign in with admin / admin again to switch test accounts.')
  const result = await signInPersona(persona, password)
  if (result.error) throw result.error
  return result.data.session
}

export function clearFunctionalTestUnlock() {
  sessionStorage.removeItem(TEST_UNLOCK_KEY)
}
