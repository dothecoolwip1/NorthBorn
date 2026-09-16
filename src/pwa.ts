export type NorthbornUpdateMode = 'auto' | 'notify'
export type NorthbornReleaseInfo = {
  version: string
  released_at?: string
  title?: string
  notes: string[]
}

export const PWA_UPDATE_MODE_KEY = 'northborn_update_mode'
export const PWA_UPDATE_NOTICE_KEY = 'northborn_update_notice'

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

export const getNorthbornReleaseInfo = async (): Promise<NorthbornReleaseInfo | null> => {
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin)
    const url = new URL('release.json', base)
    url.searchParams.set('_northborn', Date.now().toString())
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json() as Partial<NorthbornReleaseInfo>
    if (!data.version || !Array.isArray(data.notes)) return null
    return {
      version: String(data.version),
      released_at: data.released_at ? String(data.released_at) : undefined,
      title: data.title ? String(data.title) : undefined,
      notes: data.notes.map(note => String(note)).filter(Boolean),
    }
  } catch {
    return null
  }
}

export const consumeNorthbornUpdateNotice = (): NorthbornReleaseInfo | null => {
  try {
    const raw = localStorage.getItem(PWA_UPDATE_NOTICE_KEY)
    if (!raw) return null
    localStorage.removeItem(PWA_UPDATE_NOTICE_KEY)
    const data = JSON.parse(raw) as NorthbornReleaseInfo
    if (!data?.version || !Array.isArray(data.notes)) return null
    return data
  } catch {
    localStorage.removeItem(PWA_UPDATE_NOTICE_KEY)
    return null
  }
}

const saveUpdateNotice = async () => {
  const release = await getNorthbornReleaseInfo()
  if (release) localStorage.setItem(PWA_UPDATE_NOTICE_KEY, JSON.stringify(release))
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
    const activateWaitingWorker = async (rememberRelease: boolean) => {
      if (!registration.waiting) return
      if (rememberRelease) await saveUpdateNotice()
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    }

    const handleWaitingWorker = () => {
      if (!registration.waiting) return
      const firstActivation = !navigator.serviceWorker.controller
      if (firstActivation) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      } else if (getPwaUpdateMode() === 'auto') {
        void activateWaitingWorker(true)
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

    const check = () => { void registration.update() }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    const interval = window.setInterval(check, 30 * 60 * 1000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)

    window.addEventListener('northborn-check-update', check)

    window.addEventListener('northborn-apply-update', () => {
      if (registration.waiting) void activateWaitingWorker(true)
      else check()
    })

    window.addEventListener('beforeunload', () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }, { once: true })
  }).catch(error => {
    console.warn('Northborn service worker registration failed.', error)
  })
}
