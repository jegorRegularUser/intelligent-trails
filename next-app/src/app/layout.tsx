import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '../styles/navigation.css'
import '../styles/modal.css'
import '../styles/activities.css'
import { Navigation } from '@/components/Navigation'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'Intelligent Trails - Умные прогулки',
  description: 'Интеллектуальное планирование маршрутов и прогулок',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <Navigation />
        {children}
      </body>
    </html>
  )
}
