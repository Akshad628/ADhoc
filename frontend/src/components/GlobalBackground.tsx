import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useMousePosition } from '../hooks/useMousePosition'

export default function GlobalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useMousePosition()
  const mouseRef = useRef({ x: 0.5, y: 0.5 })

  // Keep ref to mouse position for render loop
  useEffect(() => {
    // Normalize to -0.5 to 0.5
    if (typeof window !== 'undefined') {
      mouseRef.current = {
        x: (mouse.x / window.innerWidth) - 0.5,
        y: (mouse.y / window.innerHeight) - 0.5,
      }
    }
  }, [mouse])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 1. Setup Renderer & Scene
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050508, 0.025)

    // 2. Setup Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 4, 18)
    camera.lookAt(0, 1, 0)

    // 3. Create Stars System
    const starsCount = 600
    const starsGeometry = new THREE.BufferGeometry()
    const starsPositions = new Float32Array(starsCount * 3)
    const starsSizes = new Float32Array(starsCount)

    for (let i = 0; i < starsCount; i++) {
      // Position stars in a wide volume in front of and around the camera
      starsPositions[i * 3] = (Math.random() - 0.5) * 80
      starsPositions[i * 3 + 1] = (Math.random() - 0.2) * 40
      starsPositions[i * 3 + 2] = (Math.random() - 0.5) * 80

      starsSizes[i] = Math.random() * 0.08 + 0.02
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3))

    // Faint glowing points
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xbf5af2,
      size: 0.12,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    })

    const stars = new THREE.Points(starsGeometry, starsMaterial)
    scene.add(stars)

    // 4. Perspective Neon Grid
    const gridGroup = new THREE.Group()
    scene.add(gridGroup)

    const gridLines = 28
    const gridExtent = 40
    const gridSpacing = 2.5
    const gridLinePositions: number[] = []

    // Longitudinal lines (Z direction)
    for (let i = -gridLines / 2; i <= gridLines / 2; i++) {
      const x = i * gridSpacing
      gridLinePositions.push(x, 0, -gridExtent)
      gridLinePositions.push(x, 0, gridExtent)
    }

    // Latitudinal lines (X direction)
    for (let i = -gridLines / 2; i <= gridLines / 2; i++) {
      const z = i * gridSpacing
      gridLinePositions.push(-gridExtent, 0, z)
      gridLinePositions.push(gridExtent, 0, z)
    }

    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridLinePositions, 3))

    // Neon cyan grid lines with soft glow
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x0a84ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    })

    const lineGrid = new THREE.LineSegments(gridGeometry, gridMaterial)
    gridGroup.add(lineGrid)

    // 5. Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0xbf5af2, 1.5, 30)
    pointLight.position.set(0, 10, 0)
    scene.add(pointLight)

    // 6. Animation Variables
    let animationFrameId: number
    const startTime = performance.now()

    // Smooth camera target offsets
    let currentCamX = 0
    let currentCamY = 4

    // Render loop
    const tick = () => {
      const elapsedTime = (performance.now() - startTime) / 1000

      // Slow drift for grid to simulate moving forward
      gridGroup.position.z = (elapsedTime * 1.5) % gridSpacing

      // Slow twinkle of stars using time
      starsMaterial.opacity = 0.5 + Math.sin(elapsedTime * 2.0) * 0.2

      // Slowly rotate stars
      stars.rotation.y = elapsedTime * 0.015

      // Parallax mouse movements with damping (easing)
      const targetCamX = mouseRef.current.x * 3.5
      const targetCamY = 4 - mouseRef.current.y * 2.0

      currentCamX += (targetCamX - currentCamX) * 0.05
      currentCamY += (targetCamY - currentCamY) * 0.05

      camera.position.x = currentCamX
      camera.position.y = currentCamY
      camera.lookAt(0, 0.5, 0)

      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(tick)
    }

    tick()

    // 7. Handle Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // 8. Clean up
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      gridGeometry.dispose()
      gridMaterial.dispose()
      starsGeometry.dispose()
      starsMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-[-10] overflow-hidden bg-space-black">
      {/* Background Volumetric Nebula Fog Layer (CSS Gradient) */}
      <div 
        className="absolute inset-0 opacity-40 transition-transform duration-1000 ease-out pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 30% 20%, rgba(191, 90, 242, 0.22) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(10, 132, 255, 0.18) 0%, transparent 60%),
            radial-gradient(circle at 50% 50%, rgba(5, 5, 8, 1) 0%, #030206 100%)
          `,
          transform: `scale(1.1) translate(${mouseRef.current.x * -10}px, ${mouseRef.current.y * -10}px)`
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
