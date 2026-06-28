import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'

interface MehfilSceneProps {
  isPlaying?: boolean
  coverUrl?: string
  onTogglePlay?: () => void
}

// 3D Realistic Candle component (The Shama)
function Candle() {
  const flameGroupRef = useRef<THREE.Group>(null)
  const flameOuterRef = useRef<THREE.Mesh>(null)
  const flameInnerRef = useRef<THREE.Mesh>(null)
  const flameBaseRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  // Generate teardrop points profile for LatheGeometry
  const points: THREE.Vector2[] = []
  for (let i = 0; i < 20; i++) {
    const t = i / 19
    // Teardrop profile: bottom is thickest, curving inwards to a pointed tip at top
    const x = Math.sin(t * Math.PI) * 0.058 * (1.0 - t * 0.45)
    const y = t * 0.2
    points.push(new THREE.Vector2(x, y))
  }

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
    <group position={[-0.55, -0.4, 0]}>
      {/* Copper Holder Base */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.06, 32]} />
        <meshStandardMaterial color="#b2734a" metalness={0.9} roughness={0.15} />
      </mesh>
      
      {/* Candle Stem Cup */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.08, 0.1, 16]} />
        <meshStandardMaterial color="#8e512d" metalness={0.95} roughness={0.1} />
      </mesh>

      {/* Wax Body (with Emissive Warm Heat Glow near flame) */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.6, 24]} />
        <meshStandardMaterial 
          color="#eae4da" 
          roughness={0.65} 
          emissive="#ff771a" 
          emissiveIntensity={0.25} 
        />
      </mesh>

      {/* Melted wax drips */}
      <mesh position={[0, 0.74, 0.04]} rotation={[0.2, 0, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#eae4da" roughness={0.7} />
      </mesh>
      <mesh position={[-0.04, 0.72, -0.02]} rotation={[-0.2, 0, 0]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#eae4da" roughness={0.7} />
      </mesh>

      {/* Wick */}
      <mesh position={[0, 0.77, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.06]} />
        <meshBasicMaterial color="#1c1613" />
      </mesh>

      {/* Layered Realistic Flickering Flame */}
      <group ref={flameGroupRef} position={[0, 0.78, 0]}>
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
      <pointLight ref={lightRef} position={[0, 0.9, 0.12]} intensity={2.8} distance={3.5} color="#ffd48a" />
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

  const mothConfigs: MothState[] = [
    { x: -0.55, y: 0.48, z: 0, angle: 0, radiusX: 0.28, radiusZ: 0.22, speed: 2.2, yFreq: 1.8, yOffset: 0.2 },
    { x: -0.55, y: 0.48, z: 0, angle: Math.PI * 0.6, radiusX: 0.35, radiusZ: 0.32, speed: -1.8, yFreq: 2.4, yOffset: 0.5 },
    { x: -0.55, y: 0.48, z: 0, angle: Math.PI * 1.3, radiusX: 0.24, radiusZ: 0.28, speed: 2.6, yFreq: 3.2, yOffset: -0.1 },
  ];

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

// 3D Vinyl Record Deck component with front-facing tilt & translucent hover play/pause controls
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
  const currentSpeed = useRef(0)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [hovered, setHovered] = useState(false)

  // Floating play/pause button opacity interpolation variables
  const buttonOpacity = useRef(0)
  const buttonMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const iconMaterialRef1 = useRef<THREE.MeshBasicMaterial>(null)
  const iconMaterialRef2 = useRef<THREE.MeshBasicMaterial>(null)

  // Load cover art texture dynamically
  useEffect(() => {
    if (!coverUrl) {
      setTexture(null)
      return
    }
    const loader = new THREE.TextureLoader()
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

  useFrame(() => {
    // Deceleration/Acceleration math
    const targetSpeed = isPlaying ? 0.028 : 0
    currentSpeed.current += (targetSpeed - currentSpeed.current) * 0.04

    if (vinylGroupRef.current && currentSpeed.current > 0.0001) {
      // Spin the vinyl disk flat relative to its face (local Y-axis)
      vinylGroupRef.current.rotation.y += currentSpeed.current
    }

    // Play/Pause button smooth hover fade-in
    const targetOpacity = hovered ? 0.75 : 0
    buttonOpacity.current += (targetOpacity - buttonOpacity.current) * 0.16

    if (buttonMaterialRef.current) {
      buttonMaterialRef.current.opacity = buttonOpacity.current
    }
    if (iconMaterialRef1.current) {
      iconMaterialRef1.current.opacity = buttonOpacity.current * 1.3
    }
    if (iconMaterialRef2.current) {
      iconMaterialRef2.current.opacity = buttonOpacity.current * 1.3
    }
  })

  return (
    <group 
      position={[0.52, -0.05, 0]} 
      rotation={[0.32, -0.42, 0.08]} // Gorgeous front-facing perspective tilt
    >
      {/* Platter Box Base */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[1.3, 0.1, 1.3]} />
        <meshStandardMaterial color="#2d221b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Metal circular border */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.59, 0.6, 0.03, 32]} />
        <meshStandardMaterial color="#b2734a" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Interactive Platter Mesh (captures hover pointer and clicks) */}
      <mesh
        position={[0, 0.025, 0]}
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
        <cylinderGeometry args={[0.565, 0.565, 0.015, 32]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Rotating Vinyl Group */}
      <group ref={vinylGroupRef}>
        {/* Vinyl Disc Body (groove details) */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.56, 0.56, 0.016, 64]} />
          <meshPhysicalMaterial 
            color="#eae4da" 
            roughness={0.22} 
            transmission={0.85} 
            thickness={0.04}
            transparent 
            opacity={0.52} 
            metalness={0.15} 
            clearcoat={1.0}
            clearcoatRoughness={0.1}
          />
        </mesh>
        
        {/* Record Grooves details */}
        <mesh position={[0, 0.031, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.002, 32]} />
          <meshStandardMaterial color="#1a1815" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.031, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.002, 32]} />
          <meshStandardMaterial color="#1a1815" roughness={0.6} />
        </mesh>

        {/* Center Label (Cover Image / Copper backup) */}
        <mesh position={[0, 0.032, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.01, 32]} />
          {texture ? (
            <meshBasicMaterial map={texture} />
          ) : (
            <meshStandardMaterial color="#d98a5b" metalness={0.8} roughness={0.2} />
          )}
        </mesh>

        {/* Spindle Center Hole */}
        <mesh position={[0, 0.038, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.012, 16]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      </group>

      {/* Floating Translucent Glass Play/Pause Button on Hover */}
      <group position={[0, 0.04, 0]}>
        {/* Transparent Disc Base */}
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.004, 32]} />
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

      {/* Tone Arm Base */}
      <mesh position={[0.5, 0.08, -0.48]}>
        <cylinderGeometry args={[0.04, 0.05, 0.12, 16]} />
        <meshStandardMaterial color="#b2734a" metalness={0.9} />
      </mesh>
      
      {/* Tone Arm Stick */}
      <mesh position={[0.32, 0.13, -0.16]} rotation={[-0.4, 0.4, -0.1]}>
        <cylinderGeometry args={[0.01, 0.01, 0.58]} />
        <meshStandardMaterial color="#eae4da" metalness={0.8} />
      </mesh>
    </group>
  )
}

function SceneContents({ isPlaying, coverUrl, onTogglePlay }: MehfilSceneProps) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} color="#f4efea" />
      <pointLight position={[1, 1, 1.5]} intensity={1.2} color="#d98a5b" />

      {/* The Shama (Candle & flickering flame lights) */}
      <Candle />

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
