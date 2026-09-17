;(() => {
  if (!window.location.pathname.startsWith('/mallard')) return

  const href = '/mallard-brand.css?v=1'
  if (!document.querySelector(`link[href^="/mallard-brand.css"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }

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
})()
