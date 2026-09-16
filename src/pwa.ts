export type NorthbornUpdateMode = 'auto' | 'notify'

export const PWA_UPDATE_MODE_KEY = 'northborn_update_mode'

type InstallPromptOutcome = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallPromptOutcome>
}

declare global {
  interface Window {
    __northbornInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

const emit = (name: string) => window.dispatchEvent(new CustomEvent(name))

export const getPwaUpdateMode = (): NorthbornUpdateMode => {
  const stored = localStorage.getItem(PWA_UPDATE_MODE_KEY)
  return stored === 'notify' ? 'notify' : 'auto'
}

export const setPwaUpdateMode = (mode: NorthbornUpdateMode) => {
  localStorage.setItem(PWA_UPDATE_MODE_KEY, mode)
  if (mode === 'auto') emit('northborn-apply-update')
}

export const isNorthbornInstalled = () => {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

export const hasInstallPrompt = () => Boolean(window.__northbornInstallPrompt)

export const promptNorthbornInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  const prompt = window.__northbornInstallPrompt
  if (!prompt) return 'unavailable'
  await prompt.prompt()
  const result = await prompt.userChoice
  if (result.outcome === 'accepted') window.__northbornInstallPrompt = null
  return result.outcome
}

export const checkForNorthbornUpdate = () => emit('northborn-check-update')
export const applyNorthbornUpdate = () => emit('northborn-apply-update')

export const initializeNorthbornPwa = () => {
  window.addEventListener('beforeinstallprompt', event => {
    const promptEvent = event as BeforeInstallPromptEvent
    promptEvent.preventDefault()
    window.__northbornInstallPrompt = promptEvent
    emit('northborn-install-available')
  })

  window.addEventListener('appinstalled', () => {
    window.__northbornInstallPrompt = null
    emit('northborn-installed')
  })

  if (!('serviceWorker' in navigator)) return

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(registration => {
    const handleWaitingWorker = () => {
      if (!registration.waiting) return
      const firstActivation = !navigator.serviceWorker.controller
      if (firstActivation || getPwaUpdateMode() === 'auto') {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      } else {
        emit('northborn-update-available')
      }
    }

    if (registration.waiting) handleWaitingWorker()

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') handleWaitingWorker()
      })
    })

    window.addEventListener('northborn-check-update', () => {
      void registration.update()
    })

    window.addEventListener('northborn-apply-update', () => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
  }).catch(error => {
    console.warn('Northborn service worker registration failed.', error)
  })
}
