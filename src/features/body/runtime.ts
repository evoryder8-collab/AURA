import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { anatomicalLeftScreenDirection, type AreaKey, type TableRotation } from '@/domain/care'
import { anchorFor, anchorVisible, nearestAnchor, type BodyAnchor, type FigureFace } from './anchors'
import type { ProjectedMarker } from './BodyStage'
import type { Point } from './layout'

export type BodyRuntime = {
  update: (state: {
    face: FigureFace
    rotation: TableRotation
    markers: ReadonlyArray<{ area: AreaKey; pain: number; emphasis: number }>
  }) => void
  dispose: () => void
}

type Projection = {
  markers: ProjectedMarker[]
  center: Point
  axis: Point
  width: number
  height: number
  leftDirection: Point
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/aura-body.glb`
let modelPromise: Promise<Object3D> | null = null

function loadModel(): Promise<Object3D> {
  modelPromise ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene)
  modelPromise.catch(() => {
    modelPromise = null
  })
  return modelPromise
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function glowTexture(): Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const PAIN_COLORS = ['#8fdcc6', '#e8d58c', '#f3a35f', '#f0705d', '#e2476d'] as const
const painColor = (score: number) =>
  new Color(PAIN_COLORS[score <= 0 ? 0 : score <= 3 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4])

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Smallest signed angle from `from` to `to`. */
const angleDelta = (from: number, to: number) => {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

const LEFT_DIRECTIONS: Record<'right' | 'down' | 'left' | 'up', Point> = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
}

export async function createBodyRuntime(
  canvas: HTMLCanvasElement,
  options: {
    interactive: boolean
    onPick: (anchor: BodyAnchor) => void
    onProject: (projection: Projection) => void
  },
): Promise<BodyRuntime> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.45

  // Lights live in camera space so the figure is always lit like a calm room, whichever way it turns.
  const key = new DirectionalLight(0xffdfb4, 2.8)
  key.position.set(-1.7, 2.3, 1.5)
  const rim = new DirectionalLight(0x7fe3d2, 3.2)
  rim.position.set(2.6, 0.5, -1.1)
  const rimWarm = new DirectionalLight(0xf3c27e, 1.7)
  rimWarm.position.set(-2.6, -0.9, -0.9)
  const fill = new HemisphereLight(0xbcd8e4, 0x0a181b, 0.38)
  scene.add(key, rim, rimWarm, fill)

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
  camera.position.set(0, 0, 6)
  camera.lookAt(0, 0, 0)

  const table = new Group() // in-plane rotation: head towards the head of the real table
  const turn = new Group() // face up / face down: rotation about the body's long axis
  const centred = new Group() // shifts the model so its centre sits at the origin
  table.add(turn)
  turn.add(centred)
  scene.add(table)

  const model = (await loadModel()).clone(true)
  const material = new MeshPhysicalMaterial({
    color: 0xd9cdbd,
    roughness: 0.6,
    metalness: 0,
    sheen: 0.45,
    sheenColor: new Color(0xffc796),
    sheenRoughness: 0.5,
    clearcoat: 0.06,
    clearcoatRoughness: 0.65,
    envMapIntensity: 0.32,
  })
  const meshes: Mesh[] = []
  model.traverse((node) => {
    if (node instanceof Mesh) {
      const original = node.material as Material & { map?: Texture | null; aoMap?: Texture | null; normalMap?: Texture | null }
      const own = material.clone()
      if (original.map) own.map = original.map
      if (original.aoMap) {
        own.aoMap = original.aoMap
        own.aoMapIntensity = 1
      }
      if (original.normalMap) own.normalMap = original.normalMap
      node.material = own
      meshes.push(node)
    }
  })
  centred.add(model)
  model.updateMatrixWorld(true)

  // Body extents in model space.
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    if (!box) continue
    const worldBox = box.clone().applyMatrix4(mesh.matrixWorld)
    min.min(worldBox.min)
    max.max(worldBox.max)
  }
  const size = new Vector3().subVectors(max, min)
  const centre = new Vector3().addVectors(min, max).multiplyScalar(0.5)
  centred.position.set(-centre.x, -centre.y, -centre.z)

  const glowMap = glowTexture()
  const glows = new Group()
  centred.add(glows)

  let width = 1
  let height = 1
  let state: Parameters<BodyRuntime['update']>[0] = { face: 'front', rotation: 0, markers: [] }
  let tableAngle = 0
  let turnAngle = 0
  let frame = 0
  let animating = false

  const targetTable = () => (-state.rotation * Math.PI) / 180
  const targetTurn = () => (state.face === 'back' ? Math.PI : 0)

  function fitCamera() {
    const vertical = state.rotation === 0 || state.rotation === 180
    const bodyW = vertical ? size.x : size.y
    const bodyH = vertical ? size.y : size.x
    const aspect = width / height
    const pad = 1.12
    let halfH = (bodyH / 2) * pad
    let halfW = halfH * aspect
    if (halfW < (bodyW / 2) * pad) {
      halfW = (bodyW / 2) * pad
      halfH = halfW / aspect
    }
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.updateProjectionMatrix()
  }

  function rebuildGlows() {
    for (const child of [...glows.children]) {
      glows.remove(child)
      ;(child as Sprite).material.dispose()
    }
    for (const marker of state.markers) {
      const anchor = anchorFor(marker.area)
      if (!anchor || marker.pain <= 0) continue
      const sprite = new Sprite(
        new SpriteMaterial({
          map: glowMap,
          color: painColor(marker.pain),
          blending: AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          transparent: true,
          opacity: 0.85 * marker.emphasis,
        }),
      )
      const [x, y, z] = anchor.position
      const [nx, ny, nz] = anchor.normal
      sprite.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02)
      const scale = (0.09 + marker.pain * 0.012) * Math.max(size.y / 1.72, 0.5)
      sprite.scale.set(scale, scale, 1)
      sprite.userData = { anchor }
      glows.add(sprite)
    }
    updateGlowVisibility()
  }

  function updateGlowVisibility() {
    const face: FigureFace = Math.cos(turnAngle) >= 0 ? 'front' : 'back'
    for (const child of glows.children) {
      const anchor = (child.userData as { anchor: BodyAnchor }).anchor
      child.visible = anchorVisible(anchor, face)
    }
  }

  function project() {
    scene.updateMatrixWorld(true)
    const toScreen = (vector: Vector3): Point => {
      const v = vector.clone().project(camera)
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
    }
    const markers: ProjectedMarker[] = state.markers.flatMap((marker) => {
      const anchor = anchorFor(marker.area)
      if (!anchor) return []
      const world = new Vector3(...anchor.position).applyMatrix4(model.matrixWorld)
      const point = toScreen(world)
      return [{ area: marker.area, x: point.x, y: point.y, visible: anchorVisible(anchor, state.face) }]
    })
    const centrePoint = toScreen(new Vector3(0, 0, 0))
    const head = toScreen(new Vector3(0, 1, 0).applyMatrix4(table.matrixWorld))
    const axisLength = Math.hypot(head.x - centrePoint.x, head.y - centrePoint.y) || 1
    options.onProject({
      markers,
      center: centrePoint,
      axis: { x: (head.x - centrePoint.x) / axisLength, y: (head.y - centrePoint.y) / axisLength },
      width,
      height,
      leftDirection: LEFT_DIRECTIONS[anatomicalLeftScreenDirection(state.face === 'front' ? 'face_up' : 'face_down', state.rotation)],
    })
  }

  function render() {
    table.rotation.z = tableAngle
    turn.rotation.y = turnAngle
    updateGlowVisibility()
    renderer.render(scene, camera)
  }

  function animateTo() {
    cancelAnimationFrame(frame)
    const fromTable = tableAngle
    const fromTurn = turnAngle
    const deltaTable = angleDelta(fromTable, targetTable())
    const deltaTurn = angleDelta(fromTurn, targetTurn()) || 0
    fitCamera()
    if (reducedMotion() || (Math.abs(deltaTable) < 1e-4 && Math.abs(deltaTurn) < 1e-4)) {
      tableAngle = fromTable + deltaTable
      turnAngle = fromTurn + deltaTurn
      render()
      project()
      return
    }
    animating = true
    const start = performance.now()
    const duration = 720
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = easeInOut(t)
      tableAngle = fromTable + deltaTable * eased
      // A flip turns the figure about its long axis, like a client turning over.
      turnAngle = fromTurn + (deltaTurn === 0 ? 0 : Math.sign(deltaTurn || 1) * Math.abs(deltaTurn)) * eased
      render()
      if (t < 1) {
        frame = requestAnimationFrame(step)
      } else {
        animating = false
        project()
      }
    }
    frame = requestAnimationFrame(step)
  }

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect || rect.width < 2 || rect.height < 2) return
    width = rect.width
    height = rect.height
    renderer.setSize(width, height, false)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    fitCamera()
    render()
    if (!animating) project()
  }
  const observer = new ResizeObserver(resize)
  if (canvas.parentElement) observer.observe(canvas.parentElement)
  resize()

  // Picking: a tap (not a drag) chooses the nearest anchor visible from this side.
  const raycaster = new Raycaster()
  let down: { x: number; y: number } | null = null
  const onDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY }
  }
  const onUp = (event: PointerEvent) => {
    if (!options.interactive || !down) return
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    down = null
    if (moved > 10) return
    const rect = canvas.getBoundingClientRect()
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObjects(meshes, false)[0]
    if (!hit) return
    const local = model.worldToLocal(hit.point.clone())
    const anchor = nearestAnchor([local.x, local.y, local.z], state.face)
    if (anchor) options.onPick(anchor)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)

  return {
    update(next) {
      const geometryChanged = next.face !== state.face || next.rotation !== state.rotation
      state = next
      rebuildGlows()
      if (geometryChanged) animateTo()
      else {
        render()
        project()
      }
    },
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      for (const child of glows.children) (child as Sprite).material.dispose()
      glowMap.dispose()
      for (const mesh of meshes) (mesh.material as Material).dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
