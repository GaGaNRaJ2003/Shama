import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@shadergradient/react', '@paper-design/shaders-react'],
}

export default nextConfig
