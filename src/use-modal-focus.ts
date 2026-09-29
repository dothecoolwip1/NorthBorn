import { useEffect, useRef } from 'react'

// Keep keyboard focus inside an open modal and return it to the opening control.
export function useModalFocus(onClose: () => void, busy = false) {
  const ref = useRef<HTMLElement>(null)
  const state = useRef({ onClose, busy })
  useEffect(() => { state.current = { onClose, busy } }, [onClose, busy])
  useEffect(() => {
    const modal = ref.current
    if (!modal) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () => [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'))
    if (!modal.contains(document.activeElement)) (controls()[0] || modal).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        if (!state.current.busy) state.current.onClose()
      }
      if (event.key !== 'Tab') return
      const items = controls(), first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); modal.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return ref
}
