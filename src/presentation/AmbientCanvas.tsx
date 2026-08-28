import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  clearPublishedBackdropContrast,
  estimateBackdropDarkness,
  publishBackdropContrast,
} from './backdropContrast'

export interface AmbientCanvasProps {
  className?: string
  /** Normalized canvas coordinates (0..1) supplied by the app when available. */
  input?: AmbientInput
  onFallback?: (reason: 'context-lost' | 'webgl-unavailable') => void
}

export interface AmbientInput {
  x: number
  y: number
  isActive: boolean
}

type Blob = {
  base: THREE.Vector2
  position: THREE.Vector2
  target: THREE.Vector2
  velocity: THREE.Vector2
  radius: number
  darkness: number
  phase: number
  drift: THREE.Vector2
  uniform: THREE.Vector4
}

const MAX_PIXEL_RATIO = 1.5
const TOUCH_DECAY_MS = 1200
const BLOB_SPRING = 9
const BLOB_DAMPING = 2.8

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function createBlobs(): Blob[] {
  const definitions = [
    { x: 0.18, y: 0.25, radius: 0.25, darkness: 0.17, phase: 0.4, driftX: 0.065, driftY: 0.05 },
    { x: 0.55, y: 0.21, radius: 0.27, darkness: 0.86, phase: 2.1, driftX: 0.075, driftY: 0.055 },
    { x: 0.79, y: 0.48, radius: 0.235, darkness: 0.26, phase: 4.2, driftX: 0.06, driftY: 0.075 },
    { x: 0.43, y: 0.63, radius: 0.29, darkness: 0.07, phase: 5.3, driftX: 0.085, driftY: 0.06 },
    { x: 0.12, y: 0.76, radius: 0.22, darkness: 0.58, phase: 3.3, driftX: 0.055, driftY: 0.07 },
  ]

  return definitions.map((definition) => {
    const base = new THREE.Vector2(definition.x, definition.y)
    return {
      base,
      position: base.clone(),
      target: base.clone(),
      velocity: new THREE.Vector2(),
      radius: definition.radius,
      darkness: definition.darkness,
      phase: definition.phase,
      drift: new THREE.Vector2(definition.driftX, definition.driftY),
      uniform: new THREE.Vector4(definition.x, definition.y, definition.radius, 1),
    }
  })
}

/**
 * A five-color metaball field. Its one render loop drives a slow idle dance and
 * spring-based interaction, while the canvas itself remains non-interactive so
 * it cannot take ownership of page gestures.
 */
export function AmbientCanvas({ className, input, onFallback }: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackReported = useRef(false)
  const inputRef = useRef<AmbientInput | undefined>(input)
  const fallbackCallbackRef = useRef(onFallback)
  const requestRenderRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    inputRef.current = input
    requestRenderRef.current?.()
  }, [input])

  useEffect(() => {
    fallbackCallbackRef.current = onFallback
  }, [onFallback])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const reportFallback = (reason: 'context-lost' | 'webgl-unavailable') => {
      if (fallbackReported.current) return
      fallbackReported.current = true
      fallbackCallbackRef.current?.(reason)
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
      })
    } catch {
      reportFallback('webgl-unavailable')
      return undefined
    }

    renderer.setClearColor(0xfff7df, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    const blobs = createBlobs()
    const uniforms = {
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uInteraction: { value: 0 },
      uColorTime: { value: 0 },
      uRippleTime: { value: 0 },
      uBlobA: { value: blobs[0].uniform },
      uBlobB: { value: blobs[1].uniform },
      uBlobC: { value: blobs[2].uniform },
      uBlobD: { value: blobs[3].uniform },
      uBlobE: { value: blobs[4].uniform },
    }
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform vec2 uPointer;
          uniform vec2 uResolution;
          uniform float uInteraction;
          uniform float uColorTime;
          uniform float uRippleTime;
          uniform vec4 uBlobA;
          uniform vec4 uBlobB;
          uniform vec4 uBlobC;
          uniform vec4 uBlobD;
          uniform vec4 uBlobE;

          float blobField(vec2 point, vec4 blob) {
            float aspect = uResolution.x / max(uResolution.y, 1.0);
            vec2 center = vec2(blob.x * aspect, blob.y);
            vec2 pointer = vec2(uPointer.x * aspect, uPointer.y);
            vec2 pull = pointer - center;
            float angle = atan(pull.y, pull.x);
            vec2 delta = point - center;
            float radial = length(delta);
            float ripple = 1.0
              + sin(radial * 30.0 - uRippleTime * 2.2 + blob.x * 9.0) * (0.045 + uInteraction * 0.035)
              + sin(radial * 17.0 + uRippleTime * 1.35 + blob.y * 11.0) * 0.028;
            float cosine = cos(angle);
            float sine = sin(angle);
            vec2 local = vec2(
              cosine * delta.x + sine * delta.y,
              -sine * delta.x + cosine * delta.y
            );
            local.x /= blob.w;
            local.y *= sqrt(blob.w);
            local /= ripple;
            return (blob.z * blob.z) / (dot(local, local) + 0.0015);
          }

          void main() {
            float aspect = uResolution.x / max(uResolution.y, 1.0);
            vec2 point = vec2(vUv.x * aspect, vUv.y);
            float a = blobField(point, uBlobA);
            float b = blobField(point, uBlobB);
            float c = blobField(point, uBlobC);
            float d = blobField(point, uBlobD);
            float e = blobField(point, uBlobE);
            float total = a + b + c + d + e;

            float weight = max(total, 0.001);
            float coralShift = 0.5 + 0.5 * sin(uColorTime * 0.32 + uBlobA.x * 6.0 + uBlobA.y * 3.0);
            float indigoShift = 0.5 + 0.5 * sin(uColorTime * 0.27 + uBlobB.x * 4.0 - uBlobB.y * 5.0);
            float tealShift = 0.5 + 0.5 * sin(uColorTime * 0.29 + uBlobC.x * 5.0 + uBlobC.y * 4.0);
            float yellowShift = 0.5 + 0.5 * sin(uColorTime * 0.24 + uBlobD.x * 3.0 - uBlobD.y * 6.0);
            float pinkShift = 0.5 + 0.5 * sin(uColorTime * 0.3 + uBlobE.x * 7.0 + uBlobE.y * 2.0);
            vec3 coral = mix(vec3(1.0, 0.10, 0.08), vec3(1.0, 0.37, 0.15), coralShift * 0.4);
            vec3 indigo = mix(vec3(0.10, 0.08, 0.68), vec3(0.29, 0.28, 1.0), indigoShift * 0.4);
            vec3 teal = mix(vec3(0.0, 0.57, 0.46), vec3(0.05, 0.87, 0.69), tealShift * 0.4);
            vec3 yellow = mix(vec3(1.0, 0.60, 0.02), vec3(1.0, 0.90, 0.18), yellowShift * 0.4);
            vec3 pink = mix(vec3(0.84, 0.06, 0.32), vec3(1.0, 0.28, 0.59), pinkShift * 0.4);
            vec3 blobColor = (coral * a + indigo * b + teal * c + yellow * d + pink * e) / weight;

            float merged = smoothstep(0.92, 1.12, total);
            float contour = smoothstep(0.78, 0.94, total) - smoothstep(0.98, 1.15, total);
            float core = smoothstep(1.16, 2.15, total);
            float contact = 1.0 - smoothstep(0.0, 0.2, length(vUv - uPointer));
            float grain = fract(sin(dot(vUv * 1193.0, vec2(12.9898, 78.233))) * 43758.5453);
            vec3 paper = vec3(1.0, 0.969, 0.875) + (grain - 0.5) * 0.012;
            vec3 color = mix(paper, blobColor, merged * 0.98);
            color = mix(color, vec3(0.10, 0.07, 0.28), contour * 0.46);
            color = mix(color, min(blobColor * 1.18 + vec3(0.07), 1.0), core * 0.22);
            color += blobColor * contact * uInteraction * 0.13;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        depthWrite: false,
        depthTest: false,
      }),
    )
    scene.add(field)

    let animationFrame = 0
    let lastFrame = performance.now()
    let isVisible = !document.hidden
    let decayStartedAt: number | null = null
    let mouseFine = false
    let activeTouch = false
    let targetInteraction = 0
    let currentInteraction = 0
    let colorTime = 0
    let currentInkMode = publishBackdropContrast(document.documentElement, 0, 'dark')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const targetPointer = new THREE.Vector2(0.5, 0.5)
    const currentPointer = new THREE.Vector2(0.5, 0.5)
    const lastTouch = new THREE.Vector2(0.5, 0.5)
    const towardPointer = new THREE.Vector2()
    const springDelta = new THREE.Vector2()

    const render = () => renderer.render(scene, camera)

    const syncUniforms = () => {
      uniforms.uPointer.value.copy(currentPointer)
      uniforms.uInteraction.value = currentInteraction
      uniforms.uColorTime.value = colorTime
      uniforms.uRippleTime.value = reducedMotion.matches ? 0 : colorTime
      const rippleStrength = reducedMotion.matches ? 0 : 0.35 + currentInteraction * 0.65
      const rippleX = ((currentPointer.x - 0.5) * 3.2 + Math.sin(colorTime * 1.7) * 0.7) * rippleStrength
      const rippleY = ((0.5 - currentPointer.y) * 2.4 + Math.cos(colorTime * 1.35) * 0.55) * rippleStrength
      const rootStyle = document.documentElement.style
      rootStyle.setProperty('--lyrics-ripple-x', `${rippleX.toFixed(2)}px`)
      rootStyle.setProperty('--lyrics-ripple-y', `${rippleY.toFixed(2)}px`)
      rootStyle.setProperty('--lyrics-ripple-x-reverse', `${(-rippleX * 0.72).toFixed(2)}px`)
      rootStyle.setProperty('--lyrics-ripple-y-reverse', `${(-rippleY * 0.72).toFixed(2)}px`)
      currentInkMode = publishBackdropContrast(
        document.documentElement,
        estimateBackdropDarkness(
          blobs.map((blob) => ({
            x: blob.position.x,
            y: blob.position.y,
            radius: blob.radius,
            stretch: blob.uniform.w,
            darkness: blob.darkness,
          })),
        ),
        currentInkMode,
      )
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
      renderer.setSize(width, height, false)
      uniforms.uResolution.value.set(width, height)
      syncUniforms()
      render()
    }

    const readExternalInput = () => {
      const externalInput = inputRef.current
      if (!externalInput) return false
      targetPointer.set(clamp(externalInput.x, 0, 1), 1 - clamp(externalInput.y, 0, 1))
      activeTouch = externalInput.isActive
      mouseFine = false
      targetInteraction = externalInput.isActive ? 1 : 0
      decayStartedAt = null
      return true
    }

    const updateBlobTargets = (now: number, direct = false, deltaSeconds = 1 / 60) => {
      const idleTime = reducedMotion.matches ? 0 : now / 1000
      const touchStrength = activeTouch ? 1 : mouseFine ? 0.62 : 0

      blobs.forEach((blob) => {
        const idleX = (Math.sin(idleTime * 0.58 + blob.phase) + Math.sin(idleTime * 0.23 + blob.phase * 1.7) * 0.42) * blob.drift.x
        const idleY = (Math.cos(idleTime * 0.46 + blob.phase * 1.3) + Math.sin(idleTime * 0.19 + blob.phase * 0.8) * 0.4) * blob.drift.y
        blob.target.set(blob.base.x + idleX, blob.base.y + idleY)

        towardPointer.copy(targetPointer).sub(blob.target)
        const distance = towardPointer.length()
        const influence = touchStrength * Math.pow(clamp(1 - distance / 0.9, 0, 1), 1.7)
        blob.target.addScaledVector(towardPointer, 0.38 * influence)

        const stretch = 1 + influence * (activeTouch ? 1.85 : 1.08) + Math.abs(Math.sin(idleTime + blob.phase)) * 0.1
        if (direct) {
          blob.position.copy(blob.target)
          blob.velocity.set(0, 0)
        } else {
          springDelta.copy(blob.target).sub(blob.position)
          blob.velocity.addScaledVector(springDelta, BLOB_SPRING * deltaSeconds)
          blob.velocity.multiplyScalar(Math.exp(-BLOB_DAMPING * deltaSeconds))
          blob.position.addScaledVector(blob.velocity, deltaSeconds)
        }
        blob.uniform.set(blob.position.x, blob.position.y, blob.radius, stretch)
      })
    }

    const tick = (now: number) => {
      const elapsed = Math.min((now - lastFrame) / 1000, 0.05)
      lastFrame = now
      const hasExternalInput = readExternalInput()
      if (!hasExternalInput && decayStartedAt !== null) {
        const elapsedTouch = now - decayStartedAt
        targetPointer.copy(lastTouch)
        targetInteraction = clamp(1 - elapsedTouch / TOUCH_DECAY_MS, 0, 1)
        if (elapsedTouch >= TOUCH_DECAY_MS) decayStartedAt = null
      }

      currentPointer.lerp(targetPointer, 1 - Math.exp(-13 * elapsed))
      currentInteraction += (targetInteraction - currentInteraction) * (1 - Math.exp(-15 * elapsed))
      colorTime = now / 1000
      updateBlobTargets(now, false, elapsed)
      syncUniforms()
      render()

      if (isVisible && !reducedMotion.matches) {
        animationFrame = window.requestAnimationFrame(tick)
      } else {
        animationFrame = 0
      }
    }

    const requestRender = () => {
      if (!isVisible) return
      if (reducedMotion.matches) {
        readExternalInput()
        currentPointer.copy(targetPointer)
        currentInteraction = targetInteraction
        colorTime = 0
        updateBlobTargets(performance.now(), true)
        syncUniforms()
        render()
        return
      }
      if (!animationFrame) {
        lastFrame = performance.now()
        animationFrame = window.requestAnimationFrame(tick)
      }
    }
    requestRenderRef.current = requestRender

    const stop = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }

    const normalizedEventPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return new THREE.Vector2(
        clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        1 - clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      )
    }

    const setTouchContact = (event: PointerEvent) => {
      const position = normalizedEventPosition(event)
      activeTouch = true
      lastTouch.copy(position)
      targetPointer.copy(position)
      targetInteraction = 1
      decayStartedAt = null
    }

    const endTouchContact = (event: PointerEvent) => {
      lastTouch.copy(normalizedEventPosition(event))
      targetPointer.copy(lastTouch)
      activeTouch = false
      if (reducedMotion.matches) {
        targetInteraction = 0
      } else {
        decayStartedAt = performance.now()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (inputRef.current) return
      if (event.pointerType === 'mouse') {
        mouseFine = true
        targetPointer.copy(normalizedEventPosition(event))
        targetInteraction = 0.62
      } else {
        setTouchContact(event)
      }
      requestRender()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (inputRef.current) return
      if (event.pointerType === 'mouse') {
        mouseFine = true
        targetPointer.copy(normalizedEventPosition(event))
        targetInteraction = 0.62
      } else if (activeTouch) {
        setTouchContact(event)
      }
      requestRender()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!inputRef.current && event.pointerType !== 'mouse') endTouchContact(event)
      requestRender()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!inputRef.current && event.pointerType !== 'mouse') endTouchContact(event)
      requestRender()
    }

    const onPointerLeave = (event: PointerEvent) => {
      if (inputRef.current) return
      if (event.pointerType === 'mouse') {
        mouseFine = false
        targetInteraction = 0
      } else if (activeTouch) {
        endTouchContact(event)
      }
      requestRender()
    }

    const onVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible) requestRender()
      else stop()
    }

    const onReducedMotionChange = () => {
      decayStartedAt = null
      stop()
      if (reducedMotion.matches && !activeTouch && !inputRef.current?.isActive) targetInteraction = 0
      requestRender()
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      stop()
      clearPublishedBackdropContrast(document.documentElement)
      reportFallback('context-lost')
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerCancel, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    canvas.addEventListener('webglcontextlost', onContextLost)
    reducedMotion.addEventListener('change', onReducedMotionChange)

    updateBlobTargets(performance.now(), true)
    resize()
    requestRender()

    return () => {
      stop()
      requestRenderRef.current = null
      resizeObserver.disconnect()
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      reducedMotion.removeEventListener('change', onReducedMotionChange)
      clearPublishedBackdropContrast(document.documentElement)
      field.geometry.dispose()
      ;(field.material as THREE.Material).dispose()
      renderer.dispose()
      const rootStyle = document.documentElement.style
      rootStyle.removeProperty('--lyrics-ripple-x')
      rootStyle.removeProperty('--lyrics-ripple-y')
      rootStyle.removeProperty('--lyrics-ripple-x-reverse')
      rootStyle.removeProperty('--lyrics-ripple-y-reverse')
    }
  }, [])

  return <canvas ref={canvasRef} className={className ?? 'ambient-canvas'} aria-hidden="true" />
}
