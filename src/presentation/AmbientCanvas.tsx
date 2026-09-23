import { useEffect, useRef } from 'react'
import type p5 from 'p5'

export interface AmbientCanvasProps {
  className?: string
  variant?: 'search' | 'reader'
}

interface Palette {
  ink: string
  muted: string
  accent: string
  secondary: string
  surface: string
  petals?: string[]
}

interface FallingPetal {
  x: number
  y: number
  velocityX: number
  velocityY: number
  rotation: number
  rotationSpeed: number
  size: number
  age: number
  isStill?: boolean
  tone?: number
}

const MAX_PETALS = 30
const PETAL_LIFETIME_SECONDS = 32
const EMISSION_INTERVAL_MS = 85

const DEFAULT_PALETTE: Palette = {
  ink: '#373249',
  muted: '#655D7B',
  accent: '#7860A2',
  secondary: '#ABBFAE',
  surface: '#F6F4FA',
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    ink: read('--ink', DEFAULT_PALETTE.ink),
    muted: read('--ink-soft', DEFAULT_PALETTE.muted),
    accent: read('--accent', DEFAULT_PALETTE.accent),
    secondary: read('--secondary', DEFAULT_PALETTE.secondary),
    surface: read('--surface-solid', DEFAULT_PALETTE.surface),
    petals: [
      read('--petal-lilac', '#947BA9'), read('--petal-lilac', '#947BA9'),
      read('--petal-rose', '#AE839C'), read('--petal-lilac', '#947BA9'),
      read('--petal-rose', '#AE839C'), read('--petal-blue', '#789AAA'),
      read('--petal-lilac', '#947BA9'), read('--petal-rose', '#AE839C'),
      read('--petal-blue', '#789AAA'), read('--petal-peach', '#C09C96'),
    ],
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function createStillPetals(width: number, height: number): FallingPetal[] {
  return [
    { x: width * 0.78, y: height * 0.44, velocityX: 0, velocityY: 0, rotation: -0.45, rotationSpeed: 0, size: 17, age: 0, isStill: true },
    { x: width * 0.86, y: height * 0.55, velocityX: 0, velocityY: 0, rotation: 0.7, rotationSpeed: 0, size: 20, age: 0, isStill: true },
  ]
}

/** A quiet p5 branch study. Its drawing is removed from every live text surface. */
export function AmbientCanvas({ className, variant = 'reader' }: AmbientCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let disposed = false
    let sketch: p5 | undefined
    let cleanupSketchEvents = () => {}
    let lastBreeze = performance.now()
    let pointerBreeze = 0
    let pointerX = window.innerWidth * 0.5
    let pointerY = window.innerHeight * 0.5
    let pointerIsActive = false
    let fallingPetals: FallingPetal[] = []
    let blossomAnchors: { x: number; y: number }[] = []
    let fallingLeaves: FallingPetal[] = []
    let nextLeafAt = performance.now() + 2200
    let lastEmission = 0
    let pointerPhase = 0
    let pointerKind = 'mouse'
    let lastPointerMove = 0
    let geometryDirty = true
    let paletteDirty = true
    let lastPetalFrame = performance.now()
    let nextPetalAt = performance.now() + 900
    let petalTimer: number | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const schedulePetals = () => {
      if (petalTimer !== null || reducedMotion.matches || document.hidden || disposed) return
      const delay = Math.max(100, Math.min(nextPetalAt, nextLeafAt) - performance.now())
      petalTimer = window.setTimeout(() => {
        petalTimer = null
        if (!disposed && !document.hidden && !reducedMotion.matches) sketch?.redraw()
      }, delay)
    }

    void import('p5').then(({ default: P5 }) => {
      if (disposed) return

      sketch = new P5((p) => {
        let palette = readPalette()
        let width = window.innerWidth
        let height = window.innerHeight
        let textExclusions: DOMRect[] = []
        let navigationBottom = 80

        p.setup = () => {
          p.pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5))
          p.createCanvas(width, height)
          p.frameRate(60)
          p.noLoop()
          if (p.canvas) p.canvas.setAttribute('aria-hidden', 'true')
          if (reducedMotion.matches) fallingPetals = createStillPetals(width, height)
          p.redraw()
        }

        p.draw = () => {
          const now = performance.now()
          paint(now)
          const branchIsMoving = !reducedMotion.matches && now - lastBreeze <= 1600
          const petalsAreMoving = !reducedMotion.matches && (fallingPetals.length > 0 || fallingLeaves.length > 0)
          if (document.hidden || reducedMotion.matches || (!branchIsMoving && !petalsAreMoving)) {
            p.noLoop()
            schedulePetals()
            return
          }
          p.loop()
        }

        p.windowResized = () => {
          width = window.innerWidth
          height = window.innerHeight
          geometryDirty = true
          p.resizeCanvas(width, height)
          p.redraw()
        }

        function paint(now: number) {
          if (!p.canvas) return
          const activeTime = now - lastBreeze
          const settle = reducedMotion.matches || document.hidden || activeTime > 1600
            ? 0
            : Math.exp(-activeTime / 650)
          const breeze = settle * (Math.sin(activeTime * 0.007) * 1.5 + pointerBreeze * 3.2)
          if (paletteDirty) {
            palette = readPalette()
            paletteDirty = false
          }
          if (geometryDirty) {
            textExclusions = getTextExclusions()
            navigationBottom = Math.max(80, document.querySelector('.cluster-nav')?.getBoundingClientRect().bottom ?? 80)
            geometryDirty = false
          }

          p.clear()
          const context = p.drawingContext
          context.save()
          drawBranch(breeze)
          drawAutumnFrame(textExclusions)
          drawFallingLeaves(now, textExclusions)
          drawFallingPetals(now, textExclusions)
          context.restore()
        }

        function drawBranch(breeze: number) {
          const top = navigationBottom
          const bounds = new DOMRect(0, top, width, Math.max(360, height - top))
          const context = p.drawingContext as CanvasRenderingContext2D
          const compact = width <= 700
          const anchors = [
            [.19,.72,.7], [.37,.49,.94], [.55,.73,.83],
            [.62,.29,1.13], [.83,.49,1], [.91,.12,.66],
          ]
          const baseRadius = compact ? Math.min(85, width * .21) : Math.min(185, width * .16)
          blossomAnchors = anchors.map(([x, y]) => ({ x: bounds.left + bounds.width * x, y: bounds.top + bounds.height * y }))
          context.save()
          context.strokeStyle = palette.muted
          context.globalAlpha = 0.52
          context.lineWidth = compact ? 1.2 : 1.8
          context.lineCap = 'round'
          context.beginPath()
          context.moveTo(width * .04, bounds.top + bounds.height * .85)
          context.bezierCurveTo(width * .34, bounds.top + bounds.height * .31,
            width * .73, bounds.top + bounds.height * .66, width + 35, bounds.top + bounds.height * .14)
          context.stroke()
          blossomAnchors.forEach((anchor, index) => {
            context.beginPath()
            context.moveTo(anchor.x + baseRadius * 0.4, anchor.y + baseRadius * 0.48)
            context.quadraticCurveTo(anchor.x + 12, anchor.y + 5, anchor.x, anchor.y)
            context.stroke()
            drawBlossom(anchor.x, anchor.y, baseRadius * anchors[index][2], breeze * 0.5, index)
          })
          context.restore()
        }

        function drawLeaf(x: number, y: number, size: number, rotation: number, opacity: number) {
          const context = p.drawingContext as CanvasRenderingContext2D
          context.save()
          context.translate(x, y)
          context.rotate(rotation)
          context.globalAlpha = opacity
          context.fillStyle = '#A68076'
          context.strokeStyle = '#807B71'
          context.lineWidth = 0.65
          context.beginPath()
          // An original lobed silhouette, separate from the round blossom petals.
          const points = [[0,-1],[.23,-.42],[.64,-.65],[.52,-.1],[.93,.02],[.45,.37],[.53,.7],[.08,.5],[-.3,.77],[-.32,.37],[-.82,.13],[-.43,-.1],[-.56,-.6],[-.14,-.4]]
          points.forEach(([px, py], index) => {
            if (index === 0) context.moveTo(px * size, py * size)
            else context.lineTo(px * size, py * size)
          })
          context.closePath()
          context.fill()
          context.beginPath()
          context.moveTo(0, -size * .72)
          context.lineTo(0, size * .83)
          context.moveTo(0, size * .22)
          context.lineTo(-size * .42, -size * .1)
          context.moveTo(0, 0)
          context.lineTo(size * .38, -size * .22)
          context.stroke()
          context.restore()
        }

        function drawAutumnFrame(exclusions: DOMRect[]) {
          const context = p.drawingContext as CanvasRenderingContext2D
          const edge = width < 701 ? 9 : 26
          context.save()
          context.globalAlpha = .16
          context.strokeStyle = '#A68076'
          context.lineWidth = .8
          context.beginPath()
          context.moveTo(-12, height * .66)
          context.bezierCurveTo(edge * 2, height * .75, edge, height * .88, edge * 3, height + 15)
          context.stroke()
          context.restore()
          for (let index = 0; index < 3; index += 1) {
            const x = edge + index * edge * .3
            const y = height * (.74 + index * .09)
            drawLeaf(x, y, width < 701 ? 10 : 18, -.6 + index * .7, .2 * fadeAtTextEdges(x, y, exclusions, 20))
          }
        }

        function drawFallingLeaves(now: number, exclusions: DOMRect[]) {
          if (reducedMotion.matches || document.hidden) return
          if (now >= nextLeafAt) {
            if (fallingLeaves.length < (width <= 700 ? 1 : 2)) {
              fallingLeaves.push({ x: width - (width <= 700 ? 12 : 38), y: height * .36, velocityX: 0, velocityY: 17,
                rotation: .4, rotationSpeed: .12, size: width <= 700 ? 11 : 16, age: 0 })
            }
            nextLeafAt = now + 10500
          }
          const elapsed = clamp((now - lastPetalFrame) / 1000, 0, .05)
          fallingLeaves = fallingLeaves.filter(leaf => leaf.age < 18 && leaf.y < height + 30)
          fallingLeaves.forEach(leaf => {
            leaf.age += elapsed
            leaf.y += leaf.velocityY * elapsed
            leaf.x += Math.sin(leaf.age * .7) * 3 * elapsed
            leaf.rotation += leaf.rotationSpeed * elapsed
            const lifeFade = Math.min(leaf.age, 18 - leaf.age, 1)
            drawLeaf(leaf.x, leaf.y, leaf.size, leaf.rotation, .38 * lifeFade * fadeAtTextEdges(leaf.x, leaf.y, exclusions, leaf.size))
          })
        }

        function drawBlossom(x: number, y: number, radius: number, breeze: number, seed: number) {
          const context = p.drawingContext
          context.save()
          context.translate(x + breeze, y)
          context.rotate(seed * 0.42 + breeze * 0.015)
          context.strokeStyle = palette.accent
          context.lineWidth = 0.8
          context.fillStyle = palette.petals?.[seed % 10] ?? palette.accent
          context.globalAlpha = document.documentElement.dataset.theme === 'dark' ? .24 : .22

          for (let petal = 0; petal < 5; petal += 1) {
            context.save()
            context.rotate((Math.PI * 2 * petal) / 5 + Math.sin(seed + petal * 3) * .06)
            context.scale(1, .9 + .1 * Math.sin(seed * 2 + petal))
            context.beginPath()
            context.moveTo(0, 0)
            context.bezierCurveTo(-radius * 0.39, -radius * 0.34, -radius * 0.36, -radius * 0.9, -radius * 0.09, -radius)
            context.quadraticCurveTo(0, -radius * 0.86, radius * 0.09, -radius)
            context.bezierCurveTo(radius * 0.36, -radius * 0.9, radius * 0.39, -radius * 0.34, 0, 0)
            context.closePath()
            context.fill()
            context.globalAlpha = .6
            context.stroke()
            context.restore()
          }

          context.globalAlpha = .55
          context.strokeStyle = palette.secondary
          context.fillStyle = palette.accent
          context.lineWidth = 0.65
          for (let stamen = 0; stamen < 5; stamen += 1) {
            const angle = (Math.PI * 2 * stamen) / 5 + seed * 0.3
            const endX = Math.cos(angle) * radius * 0.26
            const endY = Math.sin(angle) * radius * 0.26
            context.beginPath()
            context.moveTo(0, 0)
            context.lineTo(endX, endY)
            context.stroke()
            context.beginPath()
            context.arc(endX, endY, radius * 0.025, 0, Math.PI * 2)
            context.fill()
          }

          context.beginPath()
          context.fillStyle = palette.secondary
          context.arc(0, 0, radius * 0.17, 0, Math.PI * 2)
          context.fill()
          context.beginPath()
          context.fillStyle = palette.accent
          context.arc(radius * 0.18, -radius * 0.08, radius * 0.045, 0, Math.PI * 2)
          context.fill()
          context.restore()
        }

        function spawnPetalBurst(now: number) {
          const sources = blossomAnchors
          if (sources.length === 0) return
          const available = Math.max(0, 10 - fallingPetals.length)
          const count = Math.min(2, available)
          for (let index = 0; index < count; index += 1) {
            const source = sources[(Math.floor(now / 7000) + index) % sources.length]
            const jitter = Math.sin(now * 0.003 + index * 2.1)
            fallingPetals.push({
              x: source.x + jitter * 8,
              y: source.y,
              velocityX: jitter * 7,
              velocityY: 4 + index * 1.8,
              rotation: jitter,
              rotationSpeed: jitter * 0.7,
              size: clamp(Math.min(width, height) * 0.035, 12, 28) + index * 2,
              age: 0,
              tone: (Math.floor(now / 1800) + index) % 10,
            })
          }
          nextPetalAt = now + 1800
        }

        function drawFallingPetals(now: number, textExclusions: DOMRect[]) {
          if (!reducedMotion.matches && !document.hidden && now >= nextPetalAt) spawnPetalBurst(now)
          const elapsed = clamp((now - lastPetalFrame) / 1000, 0, 0.05)
          lastPetalFrame = now
          const context = p.drawingContext

          fallingPetals = fallingPetals.filter((petal) => petal.isStill || (petal.age < PETAL_LIFETIME_SECONDS && petal.y < height + 30))
          fallingPetals.forEach((petal, index) => {
            if (!petal.isStill && !reducedMotion.matches && !document.hidden) {
              petal.age += elapsed
              petal.velocityY += 8 * elapsed
              petal.velocityX += Math.sin(petal.age * 1.7 + petal.rotation) * elapsed * 4
              if (pointerIsActive) {
                const stillness = clamp((now - lastPointerMove - 100) / 850, 0, 1)
                const settle = stillness * stillness * (3 - 2 * stillness)
                const deltaX = pointerX - petal.x
                const deltaY = pointerY - petal.y
                const distance = Math.max(1, Math.hypot(deltaX, deltaY))
                const unitX = deltaX / distance
                const unitY = deltaY / distance
                const reach = pointerKind === 'touch' ? 220 : 380
                const influence = Math.pow(clamp(1 - distance / reach, 0, 1), 1.5)
                const restingRadius = (pointerKind === 'touch' ? 38 : 56) + Math.sin(index * 1.7) * 8
                // A soft repulsive core creates breathing room without assigning ring slots.
                const radialForce = clamp((distance - restingRadius) * (1.5 + settle * 8), -360, 430) * influence
                const tangentForce = (10 + Math.sin(index * 2.3) * 13) * influence
                const drag = Math.exp(-(1.2 + settle * 2.4) * elapsed)
                petal.velocityX = (petal.velocityX + (unitX * radialForce - unitY * tangentForce) * elapsed) * drag
                petal.velocityY = (petal.velocityY + (unitY * radialForce + unitX * tangentForce) * elapsed) * drag
                // Local separation preserves distinct petals as the cloud gathers.
                for (let otherIndex = index + 1; otherIndex < fallingPetals.length; otherIndex += 1) {
                  const other = fallingPetals[otherIndex]
                  const gapX = petal.x - other.x
                  const gapY = petal.y - other.y
                  const gap = Math.hypot(gapX, gapY)
                  if (gap > 0 && gap < 17) {
                    const pressure = (17 - gap) * 9 * elapsed / gap
                    petal.velocityX += gapX * pressure
                    petal.velocityY += gapY * pressure
                    other.velocityX -= gapX * pressure
                    other.velocityY -= gapY * pressure
                  }
                }
              }
              const speed = Math.hypot(petal.velocityX, petal.velocityY)
              const maxSpeed = pointerIsActive ? 420 : 68
              if (speed > maxSpeed) {
                petal.velocityX = (petal.velocityX / speed) * maxSpeed
                petal.velocityY = (petal.velocityY / speed) * maxSpeed
              }
              petal.x += petal.velocityX * elapsed
              petal.y += petal.velocityY * elapsed
              petal.rotation += petal.rotationSpeed * elapsed
              petal.velocityX *= Math.pow(.997, elapsed * 24)
              petal.velocityY *= Math.pow(.999, elapsed * 24)
            }

            const fade = petal.isStill ? 1 : Math.min(1, (PETAL_LIFETIME_SECONDS - petal.age) * 2)
            const marginFade = fadeAtTextEdges(petal.x, petal.y, textExclusions, petal.size)
            context.save()
            context.translate(petal.x, petal.y)
            context.rotate(petal.rotation)
            context.globalAlpha = Math.max(0, fade * marginFade) * 0.84
            context.fillStyle = palette.petals?.[petal.tone ?? 0] ?? palette.accent
            context.strokeStyle = palette.muted
            context.lineWidth = 0.55
            context.beginPath()
            context.moveTo(-petal.size * 0.55, 0)
            context.bezierCurveTo(-petal.size * 0.2, -petal.size * 0.55, petal.size * 0.3, -petal.size * 0.6, petal.size * 0.55, 0)
            context.bezierCurveTo(petal.size * 0.25, petal.size * 0.5, -petal.size * 0.2, petal.size * 0.55, -petal.size * 0.55, 0)
            context.closePath()
            context.fill()
            context.globalAlpha = .6
            context.stroke()
            context.restore()
          })
        }

        function getTextExclusions() {
          const selectors = variant === 'search'
            ? '.cluster-nav, .wordmark, .theme-toggle, .search-form, .result-shelf__heading, .result-card, .lookup-message'
            : '.cluster-nav, .reader-tools, .lyric-reader__identity, .lyric-reader__lines, .reader-comments__header, .reader-comments__state, .reader-comments__item, .reader-comments__actions, .reader-state > :not(.ambient-canvas):not(.canopy-space)'
          const surfaces = document.querySelectorAll<HTMLElement>(selectors)
          const exclusions: DOMRect[] = []
          surfaces.forEach((surface) => {
            if (surface.closest('[hidden]')) return
            const bounds = surface.getBoundingClientRect()
            if (bounds.width === 0 || bounds.height === 0) return
            const padding = surface.matches('.lyric-reader__lines') ? 20 : 10
            exclusions.push(new DOMRect(bounds.left - padding, bounds.top - padding, bounds.width + padding * 2, bounds.height + padding * 2))
          })
          return exclusions
        }

        function fadeAtTextEdges(x: number, y: number, exclusions: DOMRect[], radius = 0) {
          let opacity = 1
          exclusions.forEach((bounds) => {
            const outsideX = Math.max(bounds.left - x, 0, x - bounds.right)
            const outsideY = Math.max(bounds.top - y, 0, y - bounds.bottom)
            const distance = Math.max(0, Math.hypot(outsideX, outsideY) - radius)
            if (distance === 0) opacity = 0
            else if (distance < 28) opacity = Math.min(opacity, distance / 28)
          })
          return opacity
        }
      }, host)

      const redraw = () => {
        geometryDirty = true
        paletteDirty = true
        if (!sketch || document.hidden) return
        if (!sketch.isLooping?.()) sketch.redraw()
      }
      const emitPointerPetals = () => {
        const now = performance.now()
        if (!pointerIsActive || now - lastEmission < EMISSION_INTERVAL_MS) return
        lastEmission = now
        for (let index = 0; index < 3; index += 1) {
          if (fallingPetals.length >= MAX_PETALS) {
            const distantPetal = fallingPetals.findIndex(petal => Math.hypot(petal.x - pointerX, petal.y - pointerY) > 280)
            if (distantPetal < 0) break
            fallingPetals.splice(distantPetal, 1)
          }
          pointerPhase += 2.39996
          fallingPetals.push({ x: pointerX + Math.cos(pointerPhase) * 75, y: pointerY + Math.sin(pointerPhase) * 75,
            velocityX: 0, velocityY: 0, rotation: pointerPhase, rotationSpeed: .35, size: 10 + index * 2, age: 0, tone: Math.floor(pointerPhase) % 10 })
        }
      }
      const onPointerMove = (event: PointerEvent) => {
        if (reducedMotion.matches) return
        if (event.pointerType !== 'mouse' && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
        const eventTime = performance.now()
        if (Math.hypot(event.clientX - pointerX, event.clientY - pointerY) > .5) lastPointerMove = eventTime
        pointerKind = event.pointerType
        pointerX = event.clientX
        pointerY = event.clientY
        pointerIsActive = event.pointerType === 'mouse' || event.buttons > 0
        const inUpperRight = pointerX > window.innerWidth * 0.52 && pointerY > 70 && pointerY < window.innerHeight * 0.7
        pointerBreeze = inUpperRight ? clamp((pointerX / window.innerWidth - 0.5) * 1.4, 0, 0.7) : 0
        lastBreeze = performance.now()
        emitPointerPetals()
        sketch?.loop()
      }
      const onPointerDown = (event: PointerEvent) => {
        if (reducedMotion.matches) return
        pointerKind = event.pointerType
        pointerX = event.clientX
        pointerY = event.clientY
        pointerIsActive = true
        lastPointerMove = performance.now()
        emitPointerPetals()
        sketch?.loop()
      }
      const onPointerUp = () => {
        pointerIsActive = false
        sketch?.loop()
      }
      const onPointerLeave = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
          pointerIsActive = false
          pointerBreeze = 0
          lastBreeze = performance.now()
          sketch?.loop()
        }
      }
      const onVisibilityChange = () => {
        if (document.hidden) {
          if (petalTimer !== null) window.clearTimeout(petalTimer)
          petalTimer = null
          sketch?.noLoop()
        } else redraw()
      }
      const onReducedMotionChange = () => {
        lastBreeze = reducedMotion.matches ? 0 : performance.now()
        fallingPetals = []
        fallingLeaves = []
        if (reducedMotion.matches) fallingPetals = createStillPetals(window.innerWidth, window.innerHeight)
        else nextPetalAt = performance.now() + 900
        sketch?.redraw()
      }
      const onScroll = redraw
      const themeObserver = new MutationObserver(redraw)
      const layoutObserver = new ResizeObserver(redraw)

      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      layoutObserver.observe(document.body)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointerdown', onPointerDown, { passive: true })
      window.addEventListener('pointerup', onPointerUp, { passive: true })
      window.addEventListener('pointercancel', onPointerUp, { passive: true })
      window.addEventListener('pointerleave', onPointerLeave, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true })
      document.addEventListener('visibilitychange', onVisibilityChange)
      reducedMotion.addEventListener('change', onReducedMotionChange)

      cleanupSketchEvents = () => {
        themeObserver.disconnect()
        layoutObserver.disconnect()
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
        window.removeEventListener('pointerleave', onPointerLeave)
        window.removeEventListener('scroll', onScroll)
        document.removeEventListener('visibilitychange', onVisibilityChange)
        reducedMotion.removeEventListener('change', onReducedMotionChange)
      }
    })

    return () => {
      disposed = true
      if (petalTimer !== null) window.clearTimeout(petalTimer)
      cleanupSketchEvents()
      sketch?.remove()
    }
  }, [variant])

  return <div ref={hostRef} className={className ?? 'ambient-canvas'} aria-hidden="true" />
}
