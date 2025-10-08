/**
 * System Status Component
 * Displays the current status of the routing system
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertCircle, XCircle, Loader2 } from 'lucide-react';

interface SystemStatusProps {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  hasRoute: boolean;
  alternativesCount: number;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({
  isInitialized,
  isLoading,
  error,
  hasRoute,
  alternativesCount
}) => {
  const getStatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
    if (error) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (!isInitialized) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const getStatusText = () => {
    if (isLoading) return "Загрузка...";
    if (error) return "Ошибка";
    if (!isInitialized) return "Инициализация";
    return "Готов";
  };

  const getStatusVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (error) return "destructive";
    if (!isInitialized || isLoading) return "secondary";
    return "default";
  };

  return (
    <Card className="w-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">Система маршрутизации</span>
          </div>
          <Badge variant={getStatusVariant()}>
            {getStatusText()}
          </Badge>
        </div>
        
        {isInitialized && !error && (
          <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
            {hasRoute && (
              <span>✓ Маршрут построен</span>
            )}
            {alternativesCount > 0 && (
              <span>• {alternativesCount} альтернатив</span>
            )}
          </div>
        )}
        
        {error && (
          <div className="mt-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemStatus;