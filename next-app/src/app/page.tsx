'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LandingPage() {
  useEffect(() => {
    // Плавная прокрутка
    const links = document.querySelectorAll('a[href^="#"]')
    links.forEach(link => {
      link.addEventListener('click', (e: any) => {
        const href = link.getAttribute('href')
        if (href && href !== '#') {
          const target = document.querySelector(href)
          if (target) {
            e.preventDefault()
            target.scrollIntoView({ behavior: 'smooth' })
          }
        }
      })
    })

    // Анимация появления элементов
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    document.querySelectorAll('.feature-item, .step-item, .benefit-item, .category-showcase-item').forEach(el => {
      observer.observe(el)
    })
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md shadow-sm z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2 text-2xl font-bold">
              <span>✨</span>
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-transparent bg-clip-text">
                Intelligent Trails
              </span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/map" className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all">
                🗺️ К карте
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-400 rounded-full blur-3xl"></div>
        </div>
        
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 text-transparent bg-clip-text">
            🌟 Умные прогулки и маршруты
          </h1>
          <p className="text-2xl text-gray-700 mb-4">
            Откройте свой город заново с интеллектуальным планированием маршрутов
          </p>
          <p className="text-lg text-gray-600 mb-8">
            Стройте персонализированные прогулки с посещением кафе, парков, музеев и достопримечательностей.<br/>
            Или просто постройте классический маршрут из точки А в точку Б.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/map" className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-lg font-semibold rounded-lg hover:shadow-2xl transform hover:scale-105 transition-all">
              <span className="mr-2">🗺️</span>
              Начать планирование
            </Link>
            <a href="#features" className="px-8 py-4 bg-white text-purple-600 text-lg font-semibold rounded-lg border-2 border-purple-600 hover:bg-purple-50 transition-all">
              <span className="mr-2">👇</span>
              Узнать больше
            </a>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4"><span className="mr-2">🌟</span>Возможности</h2>
            <p className="text-gray-600 text-lg">Все, что нужно для идеальных прогулок</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '🧠', title: 'Умные прогулки', desc: 'Алгоритм самостоятельно подберет интересные места по вашим предпочтениям' },
              { icon: '🗺️', title: 'Интерактивная карта', desc: 'Современная карта от Yandex с визуализацией в реальном времени' },
              { icon: '⚙️', title: 'Гибкие настройки', desc: 'Выбирайте категории мест, время прогулки и способ передвижения' },
              { icon: '🚶', title: 'Множество режимов', desc: 'Пешком, на машине, велосипеде или общественном транспорте' },
              { icon: '💾', title: 'История маршрутов', desc: 'Сохраняйте и восстанавливайте любимые маршруты' },
              { icon: '📊', title: 'Оптимизация', desc: 'Алгоритм ищет самый эффективный путь' },
            ].map((feature, i) => (
              <div key={i} className="feature-item opacity-0 translate-y-8 transition-all duration-600 p-6 bg-white rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-2">
                <div className="text-5xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4"><span className="mr-2">🛠️</span>Как это работает?</h2>
            <p className="text-gray-600 text-lg">Простой процесс в три шага</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Выберите тип маршрута', desc: 'Умная прогулка или простой маршрут из А в Б' },
              { num: '2', title: 'Настройте параметры', desc: 'Укажите начальную точку, выберите категории, время' },
              { num: '3', title: 'Наслаждайтесь!', desc: 'Получите оптимальный маршрут с визуализацией' },
            ].map((step, i) => (
              <div key={i} className="step-item opacity-0 translate-y-8 transition-all duration-600 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-blue-600 text-white text-3xl font-bold rounded-full flex items-center justify-center">
                  {step.num}
                </div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4"><span className="mr-2">🎯</span>Категории мест</h2>
            <p className="text-gray-600 text-lg">Выберите, куда хотите заглянуть</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { icon: '☕', name: 'Кафе' },
              { icon: '🌳', name: 'Парки' },
              { icon: '🏛️', name: 'Музеи' },
              { icon: '🗿', name: 'Памятники' },
              { icon: '🍽️', name: 'Рестораны' },
              { icon: '🍺', name: 'Бары' },
              { icon: '🛍️', name: 'Магазины' },
            ].map((cat, i) => (
              <div key={i} className="category-showcase-item opacity-0 translate-y-8 transition-all duration-600 p-6 bg-white rounded-xl shadow-md hover:shadow-xl text-center">
                <div className="text-4xl mb-2">{cat.icon}</div>
                <div className="font-semibold">{cat.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-6">
        <div className="container mx-auto">
          <div className="text-center">
            <div className="text-2xl font-bold mb-4">
              <span className="mr-2">✨</span>
              Intelligent Trails
            </div>
            <p className="text-gray-400 mb-6">Умное планирование маршрутов</p>
            <p className="text-gray-500">&copy; 2025 Intelligent Trails. Все права защищены.</p>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        .animate-fade-in {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
      `}</style>
    </div>
  )
}
