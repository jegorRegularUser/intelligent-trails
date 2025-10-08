import { Map, Route, Zap, MapPin, Clock, Heart } from "lucide-react";
import Header from "@/components/Header";
import RouteBuilder from "@/components/RouteBuilder";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        <div className="container relative mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Zap className="h-4 w-4" />
              Построение умных маршрутов
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              Путешестлорпополрвуйте{" "}
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                с умом
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Создавайте оптимальные маршруты с посещением интересных мест. 
              Исторические достопримечательности, парки, кафе и многое другое в одном путешествии.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="group p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-all">
            <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Простое построение</h3>
            <p className="text-muted-foreground text-sm">
              Укажите начальную и конечную точки — получите оптимальный маршрут
            </p>
          </div>

          <div className="group p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-all">
            <div className="rounded-lg bg-accent/10 w-12 h-12 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Route className="h-6 w-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Умная оптимизация</h3>
            <p className="text-muted-foreground text-sm">
              Алгоритм учитывает ваши предпочтения и строит идеальный путь
            </p>
          </div>

          <div className="group p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-all">
            <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Heart className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Интересные места</h3>
            <p className="text-muted-foreground text-sm">
              Посетите культурные объекты, парки и кафе по пути к цели
            </p>
          </div>
        </div>

        <RouteBuilder />
      </section>

      {/* How it works Section */}
      <section className="container mx-auto px-4 py-16 mb-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Как это работает?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Три простых шага до вашего идеального маршрута
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold mb-4">
              1
            </div>
            <h3 className="text-xl font-semibold mb-2">Укажите маршрут</h3>
            <p className="text-muted-foreground">
              Введите начальную и конечную точки вашего путешествия
            </p>
          </div>

          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent text-accent-foreground text-2xl font-bold mb-4">
              2
            </div>
            <h3 className="text-xl font-semibold mb-2">Настройте параметры</h3>
            <p className="text-muted-foreground">
              Выберите время, способ передвижения и типы мест для посещения
            </p>
          </div>

          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold mb-4">
              3
            </div>
            <h3 className="text-xl font-semibold mb-2">Получите результат</h3>
            <p className="text-muted-foreground">
              Выберите один из оптимизированных маршрутов и начните путешествие
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-2">
                <Map className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-semibold">SmartRoute</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              © 2024 SmartRoute. Умные маршруты для ваших путешествий
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
