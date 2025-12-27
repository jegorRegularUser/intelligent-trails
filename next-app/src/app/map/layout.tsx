import { Navigation } from '@/components/Navigation'
import '../../styles/map.css'

export default function MapLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navigation />
      {children}
    </>
  )
}
