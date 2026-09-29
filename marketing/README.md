# Northborn Marketing

This directory is the standalone public-facing Northborn marketing frontend.

## Stack

- Astro for static-first rendering, routing, SEO and content
- React islands for stateful product demonstrations
- Motion for role-view transitions
- GSAP + ScrollTrigger for the request-to-revenue storytelling sequence
- Three.js for one selective desktop field-network visual
- Custom CSS for the Northborn industrial design system

The Northborn operations application remains in the repository root and keeps its existing React/Vite/Supabase architecture.

## Development

```bash
cd marketing
npm install
npm run dev
```

## Build

```bash
npm run build
```

## App URL

Set `PUBLIC_APP_URL` to the deployed Northborn application URL. If unset, the marketing site points to the current GitHub Pages app.

## Rive

A Rive runtime is intentionally not loaded yet. A meaningful Rive integration requires a custom authored `.riv` asset. The site already reserves the signature-animation role for a future Northborn-specific field-operation visual; adding a generic stock Rive would work against the custom-brand goal.

## Deployment intent

- `northborn.link` → this Astro marketing site
- `app.northborn.link` → the existing Northborn operations application

Until DNS is moved, this site can be deployed as a Vercel preview independently from the app.
