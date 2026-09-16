'use client'

import dynamic from 'next/dynamic'

const App = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => <div className="boot-veil" />,
})

export default function Home() {
  return <App />
}
