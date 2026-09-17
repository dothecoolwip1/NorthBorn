;(() => {
  if (!window.location.pathname.startsWith('/mallard')) return

  const SUPABASE_URL = 'https://oztfcnrwrovzasftsdwa.supabase.co'
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dGZjbnJ3cm92emFzZnRzZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDIzMTgsImV4cCI6MjEwNDcxODMxOH0.UqaBQmjZZTGTdiNTV4yaxaiumWgvDXwmS4WmMtbhtn0'

  const loadStyle = (href) => {
    if (document.querySelector(`link[href^="${href}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${href}?v=3`
    document.head.appendChild(link)
  }

  loadStyle('/mallard-brand.css')
  loadStyle('/mallard-delete.css')

  const theme = document.querySelector('meta[name="theme-color"]')
  if (theme) theme.setAttribute('content', '#050807')

  const manifest = document.querySelector('link[rel="manifest"]')
  if (manifest) manifest.setAttribute('href', '/mallard-manifest.webmanifest')

  const icon = document.querySelector('link[rel="icon"]')
  if (icon) icon.setAttribute('href', '/icons/mallard-icon.svg')

  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')
  if (appleIcon) appleIcon.setAttribute('href', '/icons/mallard-icon.svg')

  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (appleTitle) appleTitle.setAttribute('content', 'Mallard Samples')

  const setControlledValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const removeSampleReasonField = () => {
    document.querySelectorAll('label').forEach((label) => {
      const text = (label.textContent || '').trim().toLowerCase()
      const isReasonField = text.includes('why was the sample taken') || text.includes('why sample was taken')
      if (!isReasonField) return

      const textarea = label.querySelector('textarea')
      if (textarea?.required && !textarea.value.trim()) {
        setControlledValue(textarea, 'N/A')
      }

      label.remove()
    })
  }

  const trashIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>`

  const permanentlyDeleteSample = async (sampleNumber, button) => {
    const confirmed = window.confirm(
      `Permanently delete sample ${sampleNumber}?\n\n` +
      'This will delete the sample record, its lab test rows, and its history. This cannot be undone.\n\n' +
      `Sample number ${sampleNumber} will not be reused.`
    )

    if (!confirmed) return

    const originalHtml = button.innerHTML
    button.disabled = true
    button.textContent = `Deleting sample ${sampleNumber}...`

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/mallard_samples?sample_number=eq.${encodeURIComponent(sampleNumber)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Accept: 'application/json',
            Prefer: 'return=representation',
          },
        }
      )

      const text = await response.text()
      let deleted = []
      if (text) {
        try { deleted = JSON.parse(text) }
        catch { deleted = [] }
      }

      if (!response.ok) {
        const detail = deleted?.message || deleted?.hint || text || `HTTP ${response.status}`
        throw new Error(detail)
      }

      if (!Array.isArray(deleted) || deleted.length !== 1) {
        throw new Error('The sample was not deleted. Refresh the page and try again.')
      }

      window.alert(`Sample ${sampleNumber} has been permanently deleted.`)
      window.location.assign('/mallard')
    } catch (error) {
      console.error('Mallard sample deletion failed', error)
      window.alert(`Could not delete sample ${sampleNumber}. ${error?.message || 'Please try again.'}`)
      button.disabled = false
      button.innerHTML = originalHtml
    }
  }

  const addDeleteButton = () => {
    const archiveButton = document.querySelector('.mallard-v2-archive-button')
    if (!archiveButton) return

    const parent = archiveButton.parentElement
    if (!parent || parent.querySelector('.mallard-v2-delete-sample-button')) return

    const numberElement = document.querySelector('.mallard-v2-big-number')
    const sampleNumber = numberElement?.textContent?.trim() || ''
    if (!/^\d+$/.test(sampleNumber)) return

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'mallard-v2-delete-sample-button'
    button.innerHTML = `${trashIcon}<span>Delete sample ${sampleNumber}</span>`
    button.addEventListener('click', () => void permanentlyDeleteSample(sampleNumber, button))
    archiveButton.insertAdjacentElement('afterend', button)
  }

  const applyMallardEnhancements = () => {
    removeSampleReasonField()
    addDeleteButton()
  }

  applyMallardEnhancements()

  const root = document.getElementById('root') || document.body
  const observer = new MutationObserver(() => applyMallardEnhancements())
  observer.observe(root, { childList: true, subtree: true })
})()
