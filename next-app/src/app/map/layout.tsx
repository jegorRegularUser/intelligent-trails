import { Navigation } from '@/components/Navigation'

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
