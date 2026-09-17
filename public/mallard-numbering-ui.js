;(() => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
  if (!(normalizedPath === '/mallard' || normalizedPath.startsWith('/mallard/'))) return

  const setText = (element, value) => {
    if (element && element.textContent !== value) element.textContent = value
  }

  const correctNumbering = () => {
    document.querySelectorAll('option[value="oilfield"]').forEach(option => {
      if ((option.textContent || '').includes('series')) setText(option, 'Oilfield · 1000 series')
    })
    document.querySelectorAll('option[value="non_oilfield"]').forEach(option => {
      if ((option.textContent || '').includes('series')) setText(option, 'Non Oilfield · 2000 series')
    })
    document.querySelectorAll('option[value="odd_weird"]').forEach(option => {
      if ((option.textContent || '').includes('series')) setText(option, 'Odd / Weird · 3000 series')
    })

    document.querySelectorAll('.mallard-category-card').forEach(card => {
      const label = card.querySelector('strong')?.textContent?.trim()
      const number = card.querySelector('.mallard-category-number')
      const range = Array.from(card.querySelectorAll('span')).find(span => span !== number && (span.textContent || '').includes('series'))
      if (label === 'Oilfield') {
        setText(number, '1xxx')
        setText(range, '1000 series')
      } else if (label === 'Non Oilfield') {
        setText(number, '2xxx')
        setText(range, '2000 series')
      } else if (label === 'Odd / Weird') {
        setText(number, '3xxx')
        setText(range, '3000 series')
      }
    })

    const heading = document.querySelector('.mallard-page-heading h2')
    const rangeText = heading?.parentElement?.querySelector('p')
    if (heading && rangeText) {
      const label = heading.textContent || ''
      if (label.startsWith('Oilfield')) setText(rangeText, '1000 series')
      else if (label.startsWith('Non Oilfield')) setText(rangeText, '2000 series')
      else if (label.startsWith('Odd / Weird')) setText(rangeText, '3000 series')
    }

    document.querySelectorAll('.mallard-number-note').forEach(note => {
      setText(note, 'The permanent bottle number is assigned safely when you save. Existing bottle 1001 is Oilfield and 2001 is reserved for Non Oilfield.')
    })
  }

  const start = () => {
    correctNumbering()
    const observer = new MutationObserver(() => correctNumbering())
    observer.observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
