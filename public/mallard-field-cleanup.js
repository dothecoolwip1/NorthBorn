;(() => {
  if (!window.location.pathname.startsWith('/mallard')) return

  if (!document.getElementById('mallard-v2-speed-style')) {
    const style = document.createElement('style')
    style.id = 'mallard-v2-speed-style'
    style.textContent = `
      .mallard-v2-date-only-input { width: 100%; }
      .mallard-v2-original-datetime { display: none !important; }
      .mallard-v2-form textarea { resize: vertical; }
      .detail-page .disposal-panel { border-color: rgba(183, 145, 62, .45); }
      .detail-page .disposal-panel .mallard-v2-facility-pills button { min-height: 46px; }
      @media (max-width: 680px) {
        .mallard-v2-panel { padding: 16px; }
        .mallard-v2-form-grid { gap: 10px; }
        .mallard-v2-form label { margin-bottom: 12px; }
        .mallard-v2-facility-pills { gap: 8px; }
      }
    `
    document.head.appendChild(style)
  }

  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase()

  const setControlledValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const legacyFieldMatchers = [
    'why was the sample taken',
    'why sample was taken',
    'latitude',
    'longitude',
    'job / po / reference',
    'job / reference',
    'container / bottle notes',
    'disposal ticket / reference',
    'disposal notes',
  ]

  const hideLegacyFields = () => {
    document.querySelectorAll('label').forEach((label) => {
      const directLabel = normalize(label.querySelector(':scope > span')?.textContent || label.textContent)
      const shouldHide = legacyFieldMatchers.some((matcher) => directLabel.startsWith(matcher))
      if (!shouldHide) return

      if (directLabel.startsWith('why ')) {
        const textarea = label.querySelector('textarea')
        if (textarea && !textarea.value.trim()) setControlledValue(textarea, 'N/A')
      }

      label.hidden = true
    })

    document.querySelectorAll('.mallard-v2-inline-action').forEach((row) => {
      if (normalize(row.textContent).includes('add current gps')) row.hidden = true
    })

    document.querySelectorAll('.mallard-v2-form-grid').forEach((grid) => {
      const visibleChildren = [...grid.children].filter((child) => !child.hidden)
      if (visibleChildren.length === 0) {
        grid.hidden = true
      } else {
        grid.hidden = false
        grid.style.gridTemplateColumns = visibleChildren.length === 1 ? 'minmax(0, 1fr)' : ''
      }
    })

    document.querySelectorAll('.mallard-v2-panel h3').forEach((heading) => {
      if (normalize(heading.textContent) === '4. bottle notes') heading.textContent = '4. Field notes'
    })

    document.querySelectorAll('.mallard-v2-form textarea').forEach((textarea) => {
      if (!textarea.closest('.mallard-v2-test-card') && textarea.rows > 2) textarea.rows = 2
    })
  }

  const dateLabelNames = new Map([
    ['date and time *', 'Collection date *'],
    ['collected at', 'Collection date'],
    ['dumped at', 'Dump date'],
    ['received at', 'Received date'],
    ['submitted at', 'Submitted date'],
    ['results received', 'Results received date'],
  ])

  const enhanceDateInputs = () => {
    document.querySelectorAll('input[type="datetime-local"]').forEach((original) => {
      const label = original.closest('label')
      if (!label) return

      const title = label.querySelector(':scope > span')
      const normalizedTitle = normalize(title?.textContent)
      if (title && dateLabelNames.has(normalizedTitle)) title.textContent = dateLabelNames.get(normalizedTitle)

      original.classList.add('mallard-v2-original-datetime')
      original.setAttribute('aria-hidden', 'true')
      original.tabIndex = -1

      let dateInput = label.querySelector('.mallard-v2-date-only-input')
      if (!dateInput) {
        dateInput = document.createElement('input')
        dateInput.type = 'date'
        dateInput.className = 'mallard-v2-date-only-input'
        dateInput.required = original.required
        dateInput.disabled = original.disabled
        dateInput.addEventListener('change', () => {
          const nextValue = dateInput.value ? `${dateInput.value}T12:00` : ''
          setControlledValue(original, nextValue)
        })
        original.insertAdjacentElement('afterend', dateInput)
      }

      const sourceDate = (original.value || '').slice(0, 10)
      if (document.activeElement !== dateInput && dateInput.value !== sourceDate) dateInput.value = sourceDate
      dateInput.disabled = original.disabled
    })
  }

  const stripVisibleTimes = () => {
    const selectors = [
      '.mallard-v2-sample-row-meta span',
      '.mallard-v2-draft-row span',
      '.mallard-v2-timeline-row span',
      '.mallard-v2-print-label div',
    ]

    document.querySelectorAll(selectors.join(',')).forEach((element) => {
      const current = element.textContent || ''
      const cleaned = current
        .replace(/,\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|AM|PM)?/gi, '')
        .replace(/\s{2,}/g, ' ')
      if (cleaned !== current) element.textContent = cleaned
    })
  }

  const moveDisposalToTop = () => {
    const detailPage = document.querySelector('.detail-page')
    const disposalPanel = detailPage?.querySelector('.disposal-panel')
    const statusPanel = detailPage?.querySelector('.status-panel')
    if (!detailPage || !disposalPanel || !statusPanel) return
    if (disposalPanel.nextElementSibling !== statusPanel) detailPage.insertBefore(disposalPanel, statusPanel)
  }

  let scheduled = false
  const apply = () => {
    scheduled = false
    hideLegacyFields()
    enhanceDateInputs()
    moveDisposalToTop()
    stripVisibleTimes()
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(apply)
  }

  apply()

  const root = document.getElementById('root') || document.body
  const observer = new MutationObserver(schedule)
  observer.observe(root, { childList: true, subtree: true, characterData: true })

  window.setInterval(() => {
    enhanceDateInputs()
    stripVisibleTimes()
  }, 1200)
})()
