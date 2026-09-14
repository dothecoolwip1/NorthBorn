import { useEffect } from 'react'
import { supabase } from './lib/supabase'
import './auth-enhancements.css'

const PRODUCTION_URL = 'https://northborn.vercel.app'

function getAuthRedirectUrl() {
  if (window.location.hostname.endsWith('vercel.app')) return PRODUCTION_URL
  return window.location.origin
}

function showOauthError(card: Element, message: string) {
  let messageBox = card.querySelector<HTMLDivElement>('.oauth-message')
  if (!messageBox) {
    messageBox = document.createElement('div')
    messageBox.className = 'message oauth-message'
    const googleButton = card.querySelector('.google-auth-button')
    googleButton?.insertAdjacentElement('afterend', messageBox)
  }
  messageBox.textContent = message
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

  // Only the real sign-in/sign-up card has a password field. This prevents
  // Google OAuth controls from appearing on company onboarding screens.
  if (passwordInput && !card.querySelector('.google-auth-button')) {
    const form = card.querySelector('form')
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
        showOauthError(card, error.message)
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
