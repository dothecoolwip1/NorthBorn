import { useEffect, useRef } from 'react'

export default function FieldTerrain() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return
    const motionOff = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const compact = window.matchMedia('(max-width: 860px)').matches
    if (motionOff || compact) return

    let disposed = false
    let cleanup: (() => void) | undefined

    void (async () => {
      const THREE = await import('three')
      if (disposed) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
      camera.position.set(0, 4.8, 6.5)
      camera.lookAt(0, 0, 0)

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.setClearColor(0x000000, 0)
      container.appendChild(renderer.domElement)

      const grid = new THREE.GridHelper(12, 24, 0xd58a34, 0x263b4d)
      const gridMaterials: THREE.Material[] = Array.isArray(grid.material) ? grid.material : [grid.material]
      gridMaterials.forEach(material => {
        material.transparent = true
        material.opacity = 0.36
      })
      grid.rotation.x = Math.PI * 0.015
      scene.add(grid)

      const positions = [
        [-3.2, 0.1, 1.8],
        [-1.5, 0.1, -1.2],
        [0.3, 0.1, 1.1],
        [2.2, 0.1, -1.8],
        [3.3, 0.1, 1.7],
      ] as const
      const points = positions.map(([x, y, z]) => new THREE.Vector3(x, y, z))
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd58a34, transparent: true, opacity: 0.74 })
      const line = new THREE.Line(lineGeometry, lineMaterial)
      scene.add(line)

      const dotGeometry = new THREE.SphereGeometry(0.08, 12, 12)
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xf2ae5c })
      positions.forEach(([x, y, z]) => {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial)
        dot.position.set(x, y + 0.03, z)
        scene.add(dot)
      })

      let pointerX = 0
      let pointerY = 0
      let frame = 0
      let running = true

      const resize = () => {
        const { width, height } = container.getBoundingClientRect()
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }

      const onPointer = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.26
        pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 0.12
      }

      const render = () => {
        if (!running) return
        grid.rotation.z += (pointerX - grid.rotation.z) * 0.035
        grid.rotation.x += ((Math.PI * 0.015) + pointerY - grid.rotation.x) * 0.035
        line.position.y = Math.sin(performance.now() * 0.0007) * 0.035
        renderer.render(scene, camera)
        frame = requestAnimationFrame(render)
      }

      const observer = new IntersectionObserver(entries => {
        running = entries[0]?.isIntersecting ?? true
        if (running) {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(render)
        }
      }, { threshold: 0.05 })

      resize()
      observer.observe(container)
      window.addEventListener('resize', resize)
      container.addEventListener('pointermove', onPointer)
      frame = requestAnimationFrame(render)

      cleanup = () => {
        running = false
        cancelAnimationFrame(frame)
        observer.disconnect()
        window.removeEventListener('resize', resize)
        container.removeEventListener('pointermove', onPointer)
        renderer.dispose()
        lineGeometry.dispose()
        lineMaterial.dispose()
        dotGeometry.dispose()
        dotMaterial.dispose()
        gridMaterials.forEach(material => material.dispose())
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return <div className="field-terrain" ref={host} aria-hidden="true" />
}
