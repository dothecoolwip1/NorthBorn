import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export type FunctionalTestPersona = 'manager' | 'operator' | 'client'

export const FUNCTIONAL_TEST_USERS: Record<FunctionalTestPersona, { email: string; label: string }> = {
  manager: { email: 'manager@test.com', label: 'Manager' },
  operator: { email: 'operator@test.com', label: 'Operator' },
  client: { email: 'client@test.com', label: 'Client' },
}

const TEST_UNLOCK_KEY = 'northborn_functional_test_unlock'

function underlyingTestPassword(enteredPassword: string) {
  return enteredPassword + enteredPassword
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
  const result = await supabase.auth.signInWithPassword({
    email: account.email,
    password: underlyingTestPassword(enteredPassword),
  })
  if (result.error) {
    if (result.error.message.toLowerCase().includes('invalid login')) {
      throw new Error('The Northborn functional test users have not been initialized yet.')
    }
    throw result.error
  }
  return result.data.session
}

export async function signInFunctionalTestAdmin(username: string, password: string) {
  if (username.trim().toLowerCase() !== 'admin' || password.toLowerCase() !== 'admin') {
    throw new Error('Invalid login credentials')
  }
  const session = await signInPersona('manager', password)
  sessionStorage.setItem(TEST_UNLOCK_KEY, password)
  return session
}

export async function switchFunctionalTestPersona(persona: FunctionalTestPersona) {
  const password = sessionStorage.getItem(TEST_UNLOCK_KEY)
  if (!password) throw new Error('Enter admin / admin again once to unlock test account switching in this browser tab.')
  return signInPersona(persona, password)
}

export function clearFunctionalTestUnlock() {
  sessionStorage.removeItem(TEST_UNLOCK_KEY)
}
