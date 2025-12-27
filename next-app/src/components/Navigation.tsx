'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Navigation() {
  const pathname = usePathname()
  
  // TODO: Replace with actual auth state
  const isAuthenticated = false
  const username = 'User'

  return (
    <nav className="navbar">
      <div className="container">
        <Link href="/" className="logo">
          <span className="logo-icon">✨</span>
          Intelligent Trails
        </Link>
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              <Link 
                href="/map" 
                className={pathname === '/map' ? 'active' : ''}
              >
                Карта
              </Link>
              <Link 
                href="/my-routes"
                className={pathname === '/my-routes' ? 'active' : ''}
              >
                Мои маршруты
              </Link>
              <Link 
                href="/profile"
                className={pathname === '/profile' ? 'active' : ''}
              >
                Профиль ({username})
              </Link>
              <Link href="/logout">Выход</Link>
            </>
          ) : (
            <>
              <Link href="/map">Карта</Link>
              <Link href="/login">Вход</Link>
              <Link href="/register" className="btn-register">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
