import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="rounded-lg bg-primary p-2">
              <MapPin className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              SmartRoute
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              to="/" 
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              Главная
            </Link>
            <Link 
              to="/map" 
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              Карта
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
