<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Умные прогулки и маршруты</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/landing-styles.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" rel="stylesheet">
</head>
<body>
    <?php require_once "components/navigation.php"; ?>

    <header class="hero">
        <div class="hero-content">
            <h1 class="hero-title">🌟 Умные прогулки и маршруты</h1>
            <p class="hero-subtitle">Откройте свой город заново с интеллектуальным планированием маршрутов</p>
            <p class="hero-description">Стройте персонализированные прогулки с посещением кафе, парков, музеев и достопримечательностей.<br>Или просто постройте классический маршрут из точки А в точку Б.</p>
            <div class="hero-buttons">
                <a href="map.php" class="cta-button primary">
                    <span class="btn-icon">🗺️</span>
                    Начать планирование
                </a>
                <a href="#features" class="cta-button secondary">
                    <span class="btn-icon">👇</span>
                    Узнать больше
                </a>
            </div>
        </div>
        <div class="hero-decoration">
            <div class="decoration-circle circle-1"></div>
            <div class="decoration-circle circle-2"></div>
            <div class="decoration-circle circle-3"></div>
        </div>
    </header>

    <main>
        <section id="features" class="features-section">
            <div class="container">
                <div class="section-title">
                    <h2>🌟 Возможности</h2>
                    <p>Все, что нужно для идеальных прогулок</p>
                </div>
                <div class="features-grid">
                    <div class="feature-item">
                        <div class="icon gradient-purple"><i class="fas fa-brain"></i></div>
                        <h3>Умные прогулки</h3>
                        <p>Алгоритм самостоятельно подберет интересные места по вашим предпочтениям и построит оптимальный маршрут.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon gradient-blue"><i class="fas fa-map-marked-alt"></i></div>
                        <h3>Интерактивная карта</h3>
                        <p>Современная карта от Yandex с визуализацией в реальном времени и поддержкой всех способов передвижения.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon gradient-green"><i class="fas fa-sliders-h"></i></div>
                        <h3>Гибкие настройки</h3>
                        <p>Выбирайте категории мест, время прогулки, темп и строгость по времени. Полный контроль над вашим маршрутом.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon gradient-orange"><i class="fas fa-route"></i></div>
                        <h3>Множество режимов</h3>
                        <p>Пешком, на машине, велосипеде или общественном транспорте — выбирайте любой удобный вариант.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon gradient-pink"><i class="fas fa-history"></i></div>
                        <h3>История маршрутов</h3>
                        <p>Сохраняйте и восстанавливайте любимые маршруты. Все ваши прогулки хранятся в личном кабинете.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon gradient-cyan"><i class="fas fa-chart-line"></i></div>
                        <h3>Оптимизация</h3>
                        <p>Алгоритм использует продвинутую оптимизацию для поиска самого эффективного пути.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="how-it-works-section">
            <div class="container">
                <div class="section-title">
                    <h2>🛠️ Как это работает?</h2>
                    <p>Простой процесс в три шага</p>
                </div>
                <div class="steps-grid">
                    <div class="step-item">
                        <div class="step-number">1</div>
                        <h3>Выберите тип маршрута</h3>
                        <p>Умная прогулка с интересными местами или простой маршрут из А в Б</p>
                    </div>
                    <div class="step-item">
                        <div class="step-number">2</div>
                        <h3>Настройте параметры</h3>
                        <p>Укажите начальную точку, выберите категории, время и темп</p>
                    </div>
                    <div class="step-item">
                        <div class="step-number">3</div>
                        <h3>Наслаждайтесь!</h3>
                        <p>Получите оптимальный маршрут с визуализацией на карте</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="categories-section">
            <div class="container">
                <div class="section-title">
                    <h2>🎯 Категории мест</h2>
                    <p>Выберите, куда хотите заглянуть</p>
                </div>
                <div class="categories-showcase">
                    <div class="category-showcase-item">
                        <div class="category-icon">☕</div>
                        <h4>Кафе</h4>
                        <p>Уютные кофейни</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🌳</div>
                        <h4>Парки</h4>
                        <p>Зеленые зоны</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🏛️</div>
                        <h4>Музеи</h4>
                        <p>Культурные объекты</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🗿</div>
                        <h4>Памятники</h4>
                        <p>История города</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🍽️</div>
                        <h4>Рестораны</h4>
                        <p>Лучшие заведения</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🍺</div>
                        <h4>Бары</h4>
                        <p>Вечерний отдых</p>
                    </div>
                    <div class="category-showcase-item">
                        <div class="category-icon">🛍️</div>
                        <h4>Магазины</h4>
                        <p>Шопинг зоны</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="benefits-section">
            <div class="container">
                <div class="benefits-grid">
                    <div class="benefit-text">
                        <h2>📊 Почему Intelligent Trails?</h2>
                        <div class="benefit-list">
                            <div class="benefit-item">
                                <div class="benefit-icon">✅</div>
                                <div>
                                    <h4>Экономия времени</h4>
                                    <p>Алгоритм найдет оптимальный путь за секунды</p>
                                </div>
                            </div>
                            <div class="benefit-item">
                                <div class="benefit-icon">✅</div>
                                <div>
                                    <h4>Интересные открытия</h4>
                                    <p>Откройте новые места в вашем городе</p>
                                </div>
                            </div>
                            <div class="benefit-item">
                                <div class="benefit-icon">✅</div>
                                <div>
                                    <h4>Полный контроль</h4>
                                    <p>Гибкие настройки под ваши предпочтения</p>
                                </div>
                            </div>
                            <div class="benefit-item">
                                <div class="benefit-icon">✅</div>
                                <div>
                                    <h4>Бесплатно</h4>
                                    <p>Все функции доступны абсолютно бесплатно</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="benefit-visual">
                        <div class="stats-card">
                            <div class="stat">
                                <div class="stat-number">💯</div>
                                <div class="stat-label">Оптимальность</div>
                            </div>
                            <div class="stat">
                                <div class="stat-number">⚡</div>
                                <div class="stat-label">Быстрота</div>
                            </div>
                            <div class="stat">
                                <div class="stat-number">🎯</div>
                                <div class="stat-label">Точность</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="cta-section">
            <div class="container">
                <div class="cta-content">
                    <h2>🎉 Готовы начать?</h2>
                    <p>Создайте аккаунт и начните исследовать свой город по-новому</p>
                    <div class="cta-buttons">
                        <?php if(!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true): ?>
                            <a href="register.php" class="cta-button primary large">
                                <span class="btn-icon">✨</span>
                                Создать аккаунт бесплатно
                            </a>
                        <?php else: ?>
                            <a href="map.php" class="cta-button primary large">
                                <span class="btn-icon">🗺️</span>
                                Перейти к карте
                            </a>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-brand">
                    <div class="footer-logo">
                        <span class="logo-icon">✨</span>
                        Intelligent Trails
                    </div>
                    <p>Умное планирование маршрутов</p>
                </div>
                <div class="footer-links">
                    <div class="footer-col">
                        <h4>Навигация</h4>
                        <a href="map.php">Карта</a>
                        <a href="register.php">Регистрация</a>
                        <a href="login.php">Вход</a>
                    </div>
                    <div class="footer-col">
                        <h4>Информация</h4>
                        <a href="#features">Возможности</a>
                        <a href="#">О проекте</a>
                        <a href="https://github.com/jegorRegularUser/intelligent-trails" target="_blank">GitHub</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2025 Intelligent Trails. Все права защищены.</p>
            </div>
        </div>
    </footer>

    <script>
        // Плавная прокрутка к якорям
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href !== '#' && document.querySelector(href)) {
                    e.preventDefault();
                    document.querySelector(href).scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Анимация появления элементов
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        document.querySelectorAll('.feature-item, .step-item, .benefit-item').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    </script>
</body>
</html>
