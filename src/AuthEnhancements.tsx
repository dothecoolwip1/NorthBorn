import { useEffect } from 'react'
import { supabase } from './lib/supabase'
import { resetTestLabData, TEST_MODE_KEY, TEST_PERSONA_KEY } from './test-lab'
import './auth-enhancements.css'

const PRODUCTION_URL = 'https://northborn.vercel.app'

function getAuthRedirectUrl() {
  if (window.location.hostname.endsWith('vercel.app')) return PRODUCTION_URL
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function showAuthMessage(card: Element, message: string) {
  let messageBox = card.querySelector<HTMLDivElement>('.oauth-message')
  if (!messageBox) {
    messageBox = document.createElement('div')
    messageBox.className = 'message oauth-message'
    const form = card.querySelector('form')
    form?.insertAdjacentElement('afterend', messageBox)
  }
  messageBox.textContent = message
}

function enterAdminTestMode() {
  localStorage.setItem(TEST_MODE_KEY, '1')
  localStorage.setItem(TEST_PERSONA_KEY, 'manager')
  resetTestLabData()
  window.dispatchEvent(new Event('northborn-auth-changed'))
  window.location.replace(getAuthRedirectUrl())
}

function enhanceAuthCard() {
  const card = document.querySelector('.auth-card')
  if (!card) return

  const passwordInput = Array.from(card.querySelectorAll<HTMLInputElement>('input')).find(
    input => input.type === 'password' || input.dataset.northbornPassword === 'true',
  )

  if (passwordInput && passwordInput.dataset.northbornPassword !== 'true') {
    passwordInput.dataset.northbornPassword = 'true'
    const label = passwordInput.closest('label')
    if (label) {
      label.classList.add('password-label')
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'password-toggle'
      toggle.setAttribute('aria-label', 'Show password')
      toggle.textContent = 'Show'
      toggle.addEventListener('click', () => {
        const showing = passwordInput.type === 'text'
        passwordInput.type = showing ? 'password' : 'text'
        toggle.textContent = showing ? 'Show' : 'Hide'
        toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password')
        passwordInput.focus()
      })
      label.appendChild(toggle)
    }
  }

  const form = passwordInput?.closest('form') as HTMLFormElement | null
  if (form && form.dataset.northbornRealAuth !== 'true') {
    form.dataset.northbornRealAuth = 'true'
    form.addEventListener('submit', async event => {
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input'))
      const emailInput = inputs.find(input => input !== passwordInput && input.type !== 'hidden')
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
      const email = emailInput?.value.trim() || ''
      const password = passwordInput?.value || ''
      const creating = Boolean(submitButton?.textContent?.toLowerCase().includes('create account'))
      const normalized = email.toLowerCase()

      if (!email || !password) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (!creating && normalized === 'admin' && password.toLowerCase() === 'admin') {
        enterAdminTestMode()
        return
      }

      const oldText = submitButton?.textContent || ''
      if (submitButton) {
        submitButton.disabled = true
        submitButton.textContent = 'Working…'
      }
      showAuthMessage(card, '')

      try {
        if (!email.includes('@')) {
          showAuthMessage(card, 'Use admin / admin for the test account, or enter a real email address.')
          return
        }

        const result = creating
          ? await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: getAuthRedirectUrl() },
            })
          : await supabase.auth.signInWithPassword({ email, password })

        if (result.error) {
          showAuthMessage(card, result.error.message)
          return
        }

        if (creating && !result.data.session) {
          showAuthMessage(card, 'Check your email to confirm your Northborn account.')
        }
      } catch (caught) {
        showAuthMessage(card, caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (submitButton) {
          submitButton.disabled = false
          submitButton.textContent = oldText
        }
      }
    }, true)
  }

  if (passwordInput && !card.querySelector('.google-auth-button')) {
    if (!form) return

    const divider = document.createElement('div')
    divider.className = 'auth-divider'
    divider.innerHTML = '<span>or</span>'

    const googleButton = document.createElement('button')
    googleButton.type = 'button'
    googleButton.className = 'google-auth-button'
    googleButton.innerHTML = '<span class="google-g" aria-hidden="true">G</span><span>Continue with Google</span>'
    googleButton.addEventListener('click', async () => {
      googleButton.setAttribute('disabled', 'true')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl() },
      })
      if (error) {
        googleButton.removeAttribute('disabled')
        showAuthMessage(card, error.message)
      }
    })

    form.insertAdjacentElement('afterend', divider)
    divider.insertAdjacentElement('afterend', googleButton)
  }
}

export default function AuthEnhancements() {
  useEffect(() => {
    enhanceAuthCard()
    const observer = new MutationObserver(enhanceAuthCard)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}
