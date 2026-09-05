import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface MehfilSceneProps {
  isPlaying?: boolean
  coverUrl?: string
  onTogglePlay?: () => void
}

// The Shama itself: a clay diya, oil pooled in the well and a cotton batti
// burning at the pinched spout.
function Diya() {
  const flameGroupRef = useRef<THREE.Group>(null)
  const flameOuterRef = useRef<THREE.Mesh>(null)
  const flameInnerRef = useRef<THREE.Mesh>(null)
  const flameBaseRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  // Teardrop flame profile for LatheGeometry. Memoised: a fresh array each
  // render gave `args` a new identity and rebuilt all three lathe geometries.
  const points = useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i < 20; i++) {
      const t = i / 19
      // Bottom is thickest, curving inwards to a pointed tip at top
      const x = Math.sin(t * Math.PI) * 0.058 * (1.0 - t * 0.45)
      const y = t * 0.2
      pts.push(new THREE.Vector2(x, y))
    }
    return pts
  }, [])

  // Diya profile: out along the foot, up and outward to the rim, then back
  // down the inner wall so the bowl is hollow and the rim reads thin.
  const bowlPoints = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.055, 0.0),
      new THREE.Vector2(0.1, 0.006),
      new THREE.Vector2(0.135, 0.022),
      new THREE.Vector2(0.158, 0.046),
      new THREE.Vector2(0.168, 0.072),
      new THREE.Vector2(0.166, 0.09),   // rim
      new THREE.Vector2(0.15, 0.086),   // and back down the inside
      new THREE.Vector2(0.132, 0.062),
      new THREE.Vector2(0.108, 0.04),
      new THREE.Vector2(0.06, 0.03),
      new THREE.Vector2(0.0, 0.028),
    ],
    []
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    
    // Organic flickering flame scale
    const scaleFlicker = 1.0 + Math.sin(t * 22) * 0.04 + Math.cos(t * 31) * 0.02
    const heightFlicker = 1.0 + Math.cos(t * 16) * 0.08 + Math.sin(t * 26) * 0.03
    
    if (flameGroupRef.current) {
      // Gentle swaying/dancing motion in drafts
      flameGroupRef.current.rotation.z = Math.sin(t * 6) * 0.045 + Math.cos(t * 13) * 0.02
      flameGroupRef.current.rotation.x = Math.cos(t * 5) * 0.03
    }

    if (flameOuterRef.current) flameOuterRef.current.scale.set(scaleFlicker, heightFlicker, scaleFlicker)
    if (flameInnerRef.current) flameInnerRef.current.scale.set(scaleFlicker * 0.85, heightFlicker * 0.9, scaleFlicker * 0.85)
    if (flameBaseRef.current) flameBaseRef.current.scale.set(scaleFlicker * 0.7, heightFlicker * 0.45, scaleFlicker * 0.7)

    // Dynamic point light intensity flicker
    if (lightRef.current) {
      lightRef.current.intensity = 2.8 + Math.sin(t * 22) * 0.25 + Math.cos(t * 42) * 0.12
    }
  })

  return (
    // Placement is dictated by the camera frustum: at fov 42 and z=1.7 the
    // square viewport shows x in [-0.653, 0.653], so the old x=-0.55 put the
    // thali's left edge at -0.82 — off screen. y is raised from the candle's
    // -0.4 because a diya bowl is ~0.09 tall against a 0.6 candle.
    <group position={[-0.34, 0.2, 0]}>
      {/* Brass thali the diya rests on — a diya is a ground-resting object, and
          the scene has no floor to rest it on. */}
      <mesh position={[0, -0.012, 0]}>
        <cylinderGeometry args={[0.26, 0.27, 0.016, 48]} />
        <meshStandardMaterial color="#b2734a" metalness={0.9} roughness={0.22} />
      </mesh>

      {/* The diya: a shallow earthen bowl. Lathed from a profile that runs out
          along the foot, up the outer wall, over the rim and back down the
          inside, so the rim reads thin and the well holds the oil. */}
      <mesh position={[0, 0, 0]}>
        <latheGeometry args={[bowlPoints, 48]} />
        <meshStandardMaterial
          color="#a85a33"
          roughness={0.88}
          metalness={0}
          emissive="#ff771a"
          emissiveIntensity={0.16}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pinched spout. A lathe is a surface of revolution and cannot express
          an asymmetric pinch, so the spout is its own small mesh at the rim. */}
      <mesh position={[0.148, 0.052, 0]} rotation={[0, 0, -Math.PI / 2 - 0.22]}>
        <coneGeometry args={[0.052, 0.1, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#a85a33" roughness={0.88} metalness={0} />
      </mesh>

      {/* Oil pooled in the well. Low roughness + a little metalness is what
          sells "liquid" rather than "painted". */}
      <mesh position={[0, 0.042, 0]}>
        <cylinderGeometry args={[0.125, 0.115, 0.006, 40]} />
        <meshStandardMaterial
          color="#3d2410"
          roughness={0.08}
          metalness={0.45}
          emissive="#ff9a3c"
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* Cotton batti lying across the spout, soaked end forward */}
      <mesh position={[0.115, 0.055, 0]} rotation={[0, 0, Math.PI / 2 - 0.28]}>
        <cylinderGeometry args={[0.009, 0.007, 0.13, 10]} />
        <meshStandardMaterial color="#d8cbb4" roughness={0.9} />
      </mesh>
      {/* Charred tip where the flame sits */}
      <mesh position={[0.158, 0.072, 0]}>
        <sphereGeometry args={[0.011, 8, 8]} />
        <meshBasicMaterial color="#2a1c14" />
      </mesh>

      {/* Layered Realistic Flickering Flame — unchanged, reseated on the spout */}
      <group ref={flameGroupRef} position={[0.158, 0.078, 0]}>
        {/* Outer Orange Glowing Envelope */}
        <mesh ref={flameOuterRef}>
          <latheGeometry args={[points, 32]} />
          <meshBasicMaterial color="#ff5b14" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>

        {/* Inner Yellow-White Combustion Core */}
        <mesh ref={flameInnerRef} position={[0, 0.01, 0]}>
          <latheGeometry args={[points, 32]} />
          <meshBasicMaterial color="#ffd58b" transparent opacity={0.9} />
        </mesh>

        {/* Bottom Blue Flame Base */}
        <mesh ref={flameBaseRef} position={[0, 0.001, 0]}>
          <latheGeometry args={[points, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {/* Point Light originating from flame */}
      <pointLight ref={lightRef} position={[0.158, 0.16, 0.1]} intensity={2.8} distance={3.5} color="#ffd48a" />
    </group>
  )
}

// Moth flight parameters
interface MothState {
  x: number
  y: number
  z: number
  angle: number
  radiusX: number
  radiusZ: number
  speed: number
  yFreq: number
  yOffset: number
}

// 3D Orbiting Moths (The Parwana)
function Moths() {
  const mothsRef = useRef<THREE.Group[]>([]);
  const wingLeftRefs = useRef<THREE.Mesh[]>([]);
  const wingRightRefs = useRef<THREE.Mesh[]>([]);

  const mothConfigs: MothState[] = useMemo(() => [
    // World-space, orbiting the diya's flame (group y 0.2 + local 0.078 ≈ 0.28).
    // Radii are capped so the widest orbit stays inside the same frustum the
    // lamp has to fit in.
    { x: -0.28, y: 0.32, z: 0, angle: 0, radiusX: 0.24, radiusZ: 0.2, speed: 2.2, yFreq: 1.8, yOffset: 0.2 },
    { x: -0.28, y: 0.32, z: 0, angle: Math.PI * 0.6, radiusX: 0.26, radiusZ: 0.28, speed: -1.8, yFreq: 2.4, yOffset: 0.5 },
    { x: -0.28, y: 0.32, z: 0, angle: Math.PI * 1.3, radiusX: 0.21, radiusZ: 0.24, speed: 2.6, yFreq: 3.2, yOffset: -0.1 },
  ], []);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    mothConfigs.forEach((config, i) => {
      const group = mothsRef.current[i];
      const wingL = wingLeftRefs.current[i];
      const wingR = wingRightRefs.current[i];

      if (!group) return;

      const currentAngle = config.angle + elapsed * config.speed;
      const x = config.x + Math.cos(currentAngle) * config.radiusX;
      const z = Math.sin(currentAngle) * config.radiusZ;
      const y = config.y + Math.sin(elapsed * config.yFreq + config.yOffset) * 0.25;

      group.position.set(x, y, z);
      group.rotation.y = -currentAngle + Math.PI / 2;

      const flap = Math.sin(elapsed * 68 + i * 5) * 1.1;
      if (wingL) wingL.rotation.z = flap;
      if (wingR) wingR.rotation.z = -flap;
    });
  });

  return (
    <group>
      {mothConfigs.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) mothsRef.current[i] = el;
          }}
        >
          {/* Small Moth Body */}
          <mesh>
            <boxGeometry args={[0.015, 0.015, 0.04]} />
            <meshStandardMaterial color="#42342c" roughness={0.8} />
          </mesh>

          {/* Left Wing */}
          <mesh
            ref={(el) => {
              if (el) wingLeftRefs.current[i] = el;
            }}
            position={[-0.01, 0, 0]}
          >
            <boxGeometry args={[0.035, 0.004, 0.025]} />
            <meshStandardMaterial color="#a88e7d" roughness={0.6} transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>

          {/* Right Wing */}
          <mesh
            ref={(el) => {
              if (el) wingRightRefs.current[i] = el;
            }}
            position={[0.01, 0, 0]}
          >
            <boxGeometry args={[0.035, 0.004, 0.025]} />
            <meshStandardMaterial color="#a88e7d" roughness={0.6} transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Procedurally paints a black vinyl surface — thousands of fine concentric
// grooves plus a faint anisotropic sheen — onto a canvas we use as the disc map.
// This is what sells "real record": as the platter turns, the directional
// light rakes across the grooves and a highlight sweeps around the disc.
function useVinylGrooveTexture() {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const cx = size / 2
    const cy = size / 2
    const maxR = size / 2

    // Deep vinyl black base.
    ctx.fillStyle = '#08080a'
    ctx.fillRect(0, 0, size, size)

    // A broad radial sheen so the disc doesn't read as flat matte.
    const sheen = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR)
    sheen.addColorStop(0, 'rgba(40,40,46,0.0)')
    sheen.addColorStop(0.55, 'rgba(58,58,66,0.10)')
    sheen.addColorStop(0.85, 'rgba(30,30,36,0.0)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, size, size)

    // Concentric grooves across the playing surface (label area left dark).
    const grooveStart = maxR * 0.33
    const grooveEnd = maxR * 0.99
    for (let r = grooveStart; r < grooveEnd; r += 1.6) {
      const jitter = Math.random() * 8
      const shade = 14 + Math.floor(jitter)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${shade},${shade},${shade + 3},0.55)`
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // A couple of brighter "land" bands between tracks, like a real LP.
    for (const rr of [0.5, 0.68, 0.82]) {
      ctx.beginPath()
      ctx.arc(cx, cy, maxR * rr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(90,90,98,0.18)'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
}

// 3D Vinyl Record Deck: realistic black LP that spins clockwise with inertia
// (spins up on play, coasts down on pause) and a tone-arm that drops onto the
// groove while the music runs. Hover reveals a translucent play/pause control.
function VinylRecord({
  isPlaying,
  coverUrl,
  onTogglePlay
}: {
  isPlaying: boolean
  coverUrl?: string
  onTogglePlay?: () => void
}) {
  const vinylGroupRef = useRef<THREE.Group>(null)
  const toneArmRef = useRef<THREE.Group>(null)
  const angularVel = useRef(0) // rad/s, eased toward the 33rpm target
  const armEngage = useRef(0) // 0 = parked/lifted, 1 = needle on groove
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [hovered, setHovered] = useState(false)

  const grooveTexture = useVinylGrooveTexture()

  // Floating play/pause button opacity interpolation variables
  const buttonOpacity = useRef(0)
  const buttonMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const iconMaterialRef1 = useRef<THREE.MeshBasicMaterial>(null)
  const iconMaterialRef2 = useRef<THREE.MeshBasicMaterial>(null)

  // Load cover art texture dynamically (used on the center label)
  useEffect(() => {
    if (!coverUrl) {
      setTexture(null)
      return
    }
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      coverUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        setTexture(tex)
      },
      undefined,
      (err) => {
        console.warn('[MehfilScene] Texture loader failed to load coverUrl:', coverUrl, err)
        setTexture(null)
      }
    )
  }, [coverUrl])

  // 33 1/3 rpm in rad/s.
  const SPIN_SPEED = (33.333 / 60) * Math.PI * 2

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05) // clamp big frame gaps (tab refocus)

    // Inertial platter: ease angular velocity toward target. Spin-up is a touch
    // quicker than the coast-down so a paused record glides to rest like a real one.
    const target = isPlaying ? SPIN_SPEED : 0
    const ease = isPlaying ? 2.2 : 0.9
    angularVel.current += (target - angularVel.current) * Math.min(1, d * ease)
    if (vinylGroupRef.current && angularVel.current > 0.0002) {
      // Negative local-Y rotation reads as clockwise from the viewer's side.
      vinylGroupRef.current.rotation.y -= angularVel.current * d
    }

    // Tone-arm: swing in and lower onto the record while playing; lift + park when idle.
    const armTarget = isPlaying ? 1 : 0
    armEngage.current += (armTarget - armEngage.current) * Math.min(1, d * 3)
    if (toneArmRef.current) {
      const e = armEngage.current
      toneArmRef.current.rotation.y = THREE.MathUtils.lerp(-0.22, 0.05, e) // swing over disc
      toneArmRef.current.rotation.z = THREE.MathUtils.lerp(0.16, 0.0, e) // lift / drop
    }

    // Play/Pause button smooth hover fade-in
    const targetOpacity = hovered ? 0.72 : 0
    buttonOpacity.current += (targetOpacity - buttonOpacity.current) * Math.min(1, d * 10)
    if (buttonMaterialRef.current) buttonMaterialRef.current.opacity = buttonOpacity.current
    if (iconMaterialRef1.current) iconMaterialRef1.current.opacity = buttonOpacity.current * 1.3
    if (iconMaterialRef2.current) iconMaterialRef2.current.opacity = buttonOpacity.current * 1.3
  })

  return (
    <group
      position={[0.52, -0.05, 0]}
      rotation={[0.32, -0.42, 0.08]} // Gorgeous front-facing perspective tilt
    >
      {/* Wooden/matte plinth */}
      <mesh position={[0, -0.07, 0]}>
        <boxGeometry args={[1.32, 0.12, 1.32]} />
        <meshStandardMaterial color="#241a14" metalness={0.35} roughness={0.7} />
      </mesh>

      {/* Felt slipmat under the record */}
      <mesh position={[0, -0.002, 0]}>
        <cylinderGeometry args={[0.585, 0.585, 0.01, 64]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.95} metalness={0.0} />
      </mesh>

      {/* Metal platter rim */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.61, 0.03, 64]} />
        <meshStandardMaterial color="#b2734a" metalness={0.92} roughness={0.18} />
      </mesh>

      {/* Interactive Platter Mesh (captures hover pointer and clicks) */}
      <mesh
        position={[0, 0.03, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (onTogglePlay) onTogglePlay()
        }}
      >
        <cylinderGeometry args={[0.57, 0.57, 0.02, 48]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Rotating Vinyl Group */}
      <group ref={vinylGroupRef}>
        {/* Vinyl Disc Body — glossy black with procedural grooves */}
        <mesh position={[0, 0.018, 0]} castShadow>
          <cylinderGeometry args={[0.565, 0.565, 0.022, 96]} />
          <meshPhysicalMaterial
            color="#0b0b0d"
            map={grooveTexture ?? undefined}
            roughness={0.34}
            metalness={0.2}
            clearcoat={1.0}
            clearcoatRoughness={0.16}
            reflectivity={0.5}
          />
        </mesh>

        {/* Center Label (Cover Image / Copper backup) */}
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.175, 0.175, 0.006, 48]} />
          {texture ? (
            <meshStandardMaterial map={texture} roughness={0.55} metalness={0.05} />
          ) : (
            <meshStandardMaterial color="#d98a5b" metalness={0.7} roughness={0.35} />
          )}
        </mesh>

        {/* Thin rim ring around the label (torus laid flat in the disc plane) */}
        <mesh position={[0, 0.031, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.176, 0.004, 12, 48]} />
          <meshStandardMaterial color="#1a1512" roughness={0.5} />
        </mesh>

        {/* Spindle Center Hole */}
        <mesh position={[0, 0.034, 0]}>
          <cylinderGeometry args={[0.013, 0.013, 0.02, 16]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* Spindle pin */}
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.01, 0.011, 0.05, 16]} />
          <meshStandardMaterial color="#cfcfcf" metalness={0.95} roughness={0.15} />
        </mesh>
      </group>

      {/* Floating Translucent Glass Play/Pause Button on Hover */}
      <group position={[0, 0.045, 0]}>
        {/* Transparent Disc Base */}
        <mesh>
          <cylinderGeometry args={[0.17, 0.17, 0.004, 32]} />
          <meshBasicMaterial
            ref={buttonMaterialRef}
            color="#0b0a09"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        {/* Icon Render */}
        {isPlaying ? (
          /* Pause Icon (Two vertical bars) */
          <group>
            <mesh position={[-0.025, 0.005, 0]}>
              <boxGeometry args={[0.014, 0.006, 0.054]} />
              <meshBasicMaterial ref={iconMaterialRef1} color="#eae4da" transparent opacity={0} />
            </mesh>
            <mesh position={[0.025, 0.005, 0]}>
              <boxGeometry args={[0.014, 0.006, 0.054]} />
              <meshBasicMaterial ref={iconMaterialRef2} color="#eae4da" transparent opacity={0} />
            </mesh>
          </group>
        ) : (
          /* Play Icon (Tilted flat prism arrow pointing right) */
          <mesh position={[0.01, 0.005, 0]} rotation={[Math.PI / 2, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.036, 0.064, 3]} />
            <meshBasicMaterial ref={iconMaterialRef1} color="#eae4da" transparent opacity={0} />
          </mesh>
        )}
      </group>

      {/* Tone-arm assembly — pivots at the back-right, drops onto the record */}
      <group ref={toneArmRef} position={[0.52, 0.07, -0.5]}>
        {/* Pivot post */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.045, 0.055, 0.13, 20]} />
          <meshStandardMaterial color="#b2734a" metalness={0.92} roughness={0.16} />
        </mesh>
        {/* Counterweight behind the pivot */}
        <mesh position={[0.09, 0.08, -0.02]}>
          <cylinderGeometry args={[0.035, 0.035, 0.06, 16]} />
          <meshStandardMaterial color="#2a2320" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Arm tube reaching over the disc */}
        <mesh position={[-0.22, 0.09, 0.26]} rotation={[-0.32, 0.62, -0.08]}>
          <cylinderGeometry args={[0.011, 0.011, 0.66, 16]} />
          <meshStandardMaterial color="#e7e2d8" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Head-shell + stylus at the far end */}
        <mesh position={[-0.4, 0.055, 0.44]} rotation={[0, 0.6, 0]}>
          <boxGeometry args={[0.05, 0.03, 0.03]} />
          <meshStandardMaterial color="#1c1714" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[-0.42, 0.035, 0.45]}>
          <coneGeometry args={[0.006, 0.03, 12]} />
          <meshStandardMaterial color="#cfcfcf" metalness={0.95} roughness={0.2} />
        </mesh>
      </group>
    </group>
  )
}

function SceneContents({ isPlaying, coverUrl, onTogglePlay }: MehfilSceneProps) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} color="#f4efea" />
      <pointLight position={[1, 1, 1.5]} intensity={1.2} color="#d98a5b" />

      {/* The Shama (diya + its flickering flame light) */}
      <Diya />

      {/* The Parwana (Fluttering moths) */}
      <Moths />

      {/* Rotating Vinyl Record Platter (tilted & clickable) */}
      <VinylRecord isPlaying={!!isPlaying} coverUrl={coverUrl} onTogglePlay={onTogglePlay} />
    </>
  )
}

export function MehfilScene({ isPlaying = false, coverUrl, onTogglePlay }: MehfilSceneProps) {
  return (
    <div className="mehfil-scene" aria-hidden="true">
      {/* Slightly pulled back camera with adjusted fov to frame both candle and tilted deck */}
      <Canvas camera={{ position: [0, 0.36, 1.7], fov: 42 }} dpr={[1, 1.5]}>
        <SceneContents isPlaying={isPlaying} coverUrl={coverUrl} onTogglePlay={onTogglePlay} />
      </Canvas>
    </div>
  )
}

export default MehfilScene
