import React from 'react'
import MallardSampleTrackerV2 from './MallardSampleTrackerV2'

const MALLARD_TITLE = 'Mallard Environmental Sample Tracker'
const MALLARD_THEME = '#1f5d46'

export default function MallardRoute() {
  React.useLayoutEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')

    const original = {
      title: document.title,
      manifest: manifest?.getAttribute('href') ?? null,
      icon: icon?.getAttribute('href') ?? null,
      touchIcon: touchIcon?.getAttribute('href') ?? null,
      theme: theme?.getAttribute('content') ?? null,
      appleTitle: appleTitle?.getAttribute('content') ?? null,
    }

    document.title = MALLARD_TITLE
    manifest?.setAttribute('href', '/mallard-manifest.webmanifest')
    icon?.setAttribute('href', '/icons/mallard-icon.svg')
    touchIcon?.setAttribute('href', '/icons/mallard-icon.svg')
    theme?.setAttribute('content', MALLARD_THEME)
    appleTitle?.setAttribute('content', 'Mallard Samples')

    return () => {
      document.title = original.title
      if (manifest && original.manifest) manifest.setAttribute('href', original.manifest)
      if (icon && original.icon) icon.setAttribute('href', original.icon)
      if (touchIcon && original.touchIcon) touchIcon.setAttribute('href', original.touchIcon)
      if (theme && original.theme) theme.setAttribute('content', original.theme)
      if (appleTitle && original.appleTitle) appleTitle.setAttribute('content', original.appleTitle)
    }
  }, [])

  return <MallardSampleTrackerV2 />
}
