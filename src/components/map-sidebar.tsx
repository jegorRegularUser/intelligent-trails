import React, { useState } from 'react';
import { 
  Landmark, 
  TreeDeciduous, 
  Coffee, 
  Building,
  Clock,
  Users,
  Settings, 
  Heart 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MapSidebarProps {
  onPreferencesChange: (preferences: any) => void;
  preferences: {
    interests: string[];
    timeLimit: number;
    groupSize: number;
    budget: number;
  };
}

const MapSidebar: React.FC<MapSidebarProps> = ({
  onPreferencesChange,
  preferences
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const interestCategories = [
    { id: 'historical', icon: Landmark, label: 'Исторические места' },
    { id: 'nature', icon: TreeDeciduous, label: 'Парки и природа' },
    { id: 'food', icon: Coffee, label: 'Кафе и рестораны' },
    { id: 'shopping', icon: Building, label: 'Магазины' },
  ];

  const handleInterestToggle = (interest: string) => {
    onPreferencesChange({
      ...preferences,
      interests: preferences.interests.includes(interest)
        ? preferences.interests.filter(i => i !== interest)
        : [...preferences.interests, interest]
    });
  };

  return (
    <div className={`bg-white border-r border-gray-200 h-screen transition-all duration-300 ${
      isOpen ? 'w-96' : 'w-0'
    } overflow-hidden`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Предпочтения</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="h-8 w-8 p-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Интересы */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <Heart className="h-4 w-4 text-red-500" />
            <span>Интересы</span>
          </h3>
          <div className="space-y-2">
            {interestCategories.map(({ id, icon: Icon, label }) => (
              <div key={id} className="flex items-center space-x-3">
                <Checkbox
                  id={id}
                  checked={preferences.interests.includes(id)}
                  onCheckedChange={() => handleInterestToggle(id)}
                />
                <label htmlFor={id} className="text-sm text-gray-700 flex items-center space-x-2 cursor-pointer">
                  <Icon className="h-4 w-4 text-gray-500" />
                  <span>{label}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Время */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Время путешествия</span>
          </h3>
          <div className="space-y-2">
            <Slider
              value={[preferences.timeLimit]}
              onValueChange={(value) => onPreferencesChange({ ...preferences, timeLimit: value[0] })}
              max={240}
              step={30}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>30 мин</span>
              <span>{preferences.timeLimit} мин</span>
              <span>4 часа</span>
            </div>
          </div>
        </div>

        {/* Количество людей */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Количество людей</span>
          </h3>
          <Select 
            value={preferences.groupSize.toString()} 
            onValueChange={(value) => onPreferencesChange({ 
              ...preferences, 
              groupSize: parseInt(value) 
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <SelectItem key={n} value={n.toString()}>
                  {n} человек
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Бюджет */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Бюджет</h3>
          <div className="space-y-2">
            <Slider
              value={[preferences.budget]}
              onValueChange={(value) => onPreferencesChange({ ...preferences, budget: value[0] })}
              max={5000}
              step={500}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Бесплатно</span>
              <span>{preferences.budget} ₽</span>
              <span>5000 ₽</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapSidebar;
