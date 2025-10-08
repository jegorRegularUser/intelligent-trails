/**
 * Accessibility Configurator Component
 * Specialized component for configuring accessibility preferences and constraints
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { AccessibilityManager, AccessibilityBarrierType, AccessibilityRequirementLevel } from '../../preferences/AccessibilityManager';
import { PreferenceManager } from '../../preferences/PreferenceManager';
import { UserConstraints, MobilityDevice, DetailedUserPreferences } from '../../types/preferences';
import { TransportMode } from '../../types/graph';
import { AlertTriangle, CheckCircle, Info, MapPin, Plus, Trash2, Accessibility } from 'lucide-react';

interface AccessibilityConfiguratorProps {
  userId: string;
  onConstraintsChange?: (constraints: UserConstraints) => void;
  onPreferencesChange?: (preferences: DetailedUserPreferences) => void;
}

interface BarrierFormProps {
  onSubmit: (barrier: Omit<any, 'id' | 'reportedAt'>) => void;
  onCancel: () => void;
}

const BarrierForm: React.FC<BarrierFormProps> = ({ onSubmit, onCancel }) => {
  const [type, setType] = useState<AccessibilityBarrierType>(AccessibilityBarrierType.STAIRS);
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [radius, setRadius] = useState<number>(10);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [description, setDescription] = useState<string>('');
  const [temporary, setTemporary] = useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<string>('');

  const handleSubmit = () => {
    if (!latitude || !longitude || !description) {
      alert('Please fill in all required fields');
      return;
    }

    const barrier = {
      type,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      },
      radius,
      severity,
      description,
      temporary,
      expiresAt: temporary && expiresAt ? new Date(expiresAt) : undefined
    };

    onSubmit(barrier);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="barrier-type">Barrier Type</Label>
        <Select value={type} onValueChange={(value) => setType(value as AccessibilityBarrierType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(AccessibilityBarrierType).map((barrierType) => (
              <SelectItem key={barrierType} value={barrierType}>
                {barrierType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="latitude">Latitude</Label>
          <Input
            id="latitude"
            type="number"
            step="0.000001"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="e.g., 55.755826"
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude</Label>
          <Input
            id="longitude"
            type="number"
            step="0.000001"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="e.g., 37.617300"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="radius">Radius (meters)</Label>
        <Slider
          id="radius"
          min={1}
          max={100}
          step={1}
          value={[radius]}
          onValueChange={(values) => setRadius(values[0])}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>1m</span>
          <span>{radius}m</span>
          <span>100m</span>
        </div>
      </div>

      <div>
        <Label htmlFor="severity">Severity</Label>
        <Select value={severity} onValueChange={(value) => setSeverity(value as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the barrier and its location"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="temporary"
          checked={temporary}
          onCheckedChange={setTemporary}
        />
        <Label htmlFor="temporary">Temporary Barrier</Label>
      </div>

      {temporary && (
        <div>
          <Label htmlFor="expires-at">Expires At</Label>
          <Input
            id="expires-at"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      )}

      <div className="flex space-x-2">
        <Button onClick={handleSubmit}>Report Barrier</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

interface BarrierCardProps {
  barrier: any;
  onDelete: (barrierId: string) => void;
  onUpdate: (barrierId: string, updates: Partial<any>) => void;
}

const BarrierCard: React.FC<BarrierCardProps> = ({ barrier, onDelete, onUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: AccessibilityBarrierType) => {
    switch (type) {
      case AccessibilityBarrierType.STAIRS: return '🪜';
      case AccessibilityBarrierType.STEEP_SLOPE: return '⛰️';
      case AccessibilityBarrierType.NARROW_PATH: return '🛤️';
      case AccessibilityBarrierType.UNEVEN_SURFACE: return '🚧';
      case AccessibilityBarrierType.MISSING_RAMP: return '📉';
      case AccessibilityBarrierType.MISSING_ELEVATOR: return '📉';
      case AccessibilityBarrierType.NARROW_DOORWAY: return '🚪';
      case AccessibilityBarrierType.HIGH_CURB: return '🚧';
      case AccessibilityBarrierType.MISSING_TACTILE_PAVING: return '🦯';
      case AccessibilityBarrierType.MISSING_AUDIO_SIGNALS: return '🔈';
      case AccessibilityBarrierType.INSUFFICIENT_LIGHTING: return '💡';
      case AccessibilityBarrierType.CROWDED_SPACE: return '👥';
      case AccessibilityBarrierType.CONSTRUCTION: return '🚧';
      case AccessibilityBarrierType.TEMPORARY_OBSTACLE: return '🚧';
      default: return '⚠️';
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <span className="text-xl">{getTypeIcon(barrier.type)}</span>
            <div>
              <CardTitle className="text-lg">
                {barrier.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={getSeverityColor(barrier.severity)}>
                  {barrier.severity}
                </Badge>
                {barrier.temporary && (
                  <Badge variant="outline">Temporary</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex space-x-1">
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(barrier.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm mb-2">{barrier.description}</p>
        
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <div className="flex items-center space-x-1">
            <MapPin className="h-3 w-3" />
            <span>{barrier.location.latitude.toFixed(6)}, {barrier.location.longitude.toFixed(6)}</span>
          </div>
          <div>Radius: {barrier.radius}m</div>
          {barrier.expiresAt && (
            <div>Expires: {new Date(barrier.expiresAt).toLocaleDateString()}</div>
          )}
        </div>
        
        {isExpanded && barrier.alternatives && barrier.alternatives.length > 0 && (
          <div className="mt-4">
            <Separator className="my-2" />
            <h4 className="font-medium mb-2">Alternatives</h4>
            <div className="space-y-2">
              {barrier.alternatives.map((alternative, index) => (
                <Alert key={index}>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{alternative.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</AlertTitle>
                  <AlertDescription>
                    {alternative.description}
                    {alternative.distance > 0 && (
                      <div className="mt-1">Additional distance: {alternative.distance}m</div>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const AccessibilityConfigurator: React.FC<AccessibilityConfiguratorProps> = ({
  userId,
  onConstraintsChange,
  onPreferencesChange
}) => {
  const [preferenceManager] = useState(() => PreferenceManager.getInstance());
  const [accessibilityManager] = useState(() => new AccessibilityManager(null as any));
  
  const [preferences, setPreferences] = useState<DetailedUserPreferences | null>(null);
  const [barriers, setBarriers] = useState<any[]>([]);
  const [showBarrierForm, setShowBarrierForm] = useState(false);
  const [activeTab, setActiveTab] = useState('device');

  useEffect(() => {
    loadPreferences();
    loadBarriers();
  }, [userId]);

  const loadPreferences = () => {
    const activePreferences = preferenceManager.getActivePreferences(userId);
    if (activePreferences) {
      setPreferences(activePreferences);
    }
  };

  const loadBarriers = () => {
    const allBarriers = accessibilityManager.getBarriers();
    setBarriers(allBarriers);
  };

  const handleMobilityDeviceChange = (device: Partial<MobilityDevice>) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      constraints: {
        ...preferences.constraints,
        mobilityDevice: {
          ...preferences.constraints.mobilityDevice,
          ...device
        }
      }
    };
    
    setPreferences(newPreferences);
    onConstraintsChange?.(newPreferences.constraints);
    onPreferencesChange?.(newPreferences);
  };

  const handleConstraintsChange = (constraints: Partial<UserConstraints>) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      constraints: {
        ...preferences.constraints,
        ...constraints
      }
    };
    
    setPreferences(newPreferences);
    onConstraintsChange?.(newPreferences.constraints);
    onPreferencesChange?.(newPreferences);
  };

  const handleBooleanPreferenceChange = (key: keyof DetailedUserPreferences, value: boolean) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      [key]: value
    };
    
    setPreferences(newPreferences);
    onPreferencesChange?.(newPreferences);
  };

  const handleAddBarrier = (barrier: Omit<any, 'id' | 'reportedAt'>) => {
    const barrierId = accessibilityManager.addBarrier(barrier);
    if (barrierId) {
      loadBarriers();
      setShowBarrierForm(false);
    }
  };

  const handleDeleteBarrier = (barrierId: string) => {
    if (confirm('Are you sure you want to delete this barrier?')) {
      accessibilityManager.removeBarrier(barrierId);
      loadBarriers();
    }
  };

  const handleOptimizeForAccessibility = () => {
    if (!preferences) return;
    
    const optimizedPreferences = accessibilityManager.optimizePreferencesForAccessibility(
      preferences,
      preferences.constraints
    );
    
    setPreferences(optimizedPreferences);
    onConstraintsChange?.(optimizedPreferences.constraints);
    onPreferencesChange?.(optimizedPreferences);
  };

  const BooleanToggle: React.FC<{
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }> = ({ label, description, checked, onCheckedChange }) => (
    <div className="flex items-center justify-between space-x-2">
      <div className="space-y-0.5">
        <Label htmlFor={`toggle-${label}`}>{label}</Label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        id={`toggle-${label}`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );

  if (!preferences) {
    return <div>Loading accessibility preferences...</div>;
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center">
              <Accessibility className="mr-2" />
              Accessibility Settings
            </h1>
            <p className="text-muted-foreground">
              Configure accessibility preferences and report barriers
            </p>
          </div>
          
          <Button onClick={handleOptimizeForAccessibility}>
            Optimize for Accessibility
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accessibility Configuration</CardTitle>
            <CardDescription>
              Customize your accessibility preferences and constraints
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="device">Mobility Device</TabsTrigger>
                <TabsTrigger value="constraints">Constraints</TabsTrigger>
                <TabsTrigger value="barriers">Barriers</TabsTrigger>
              </TabsList>
              
              {/* Mobility Device Tab */}
              <TabsContent value="device" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Device Type</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="device-type">Device Type</Label>
                        <Select
                          value={preferences.constraints.mobilityDevice.type}
                          onValueChange={(value) => handleMobilityDeviceChange({
                            type: value as MobilityDevice['type']
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="wheelchair">Wheelchair</SelectItem>
                            <SelectItem value="scooter">Scooter</SelectItem>
                            <SelectItem value="walker">Walker</SelectItem>
                            <SelectItem value="stroller">Stroller</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {preferences.constraints.mobilityDevice.type !== 'none' && (
                        <>
                          <div>
                            <Label htmlFor="device-width">Device Width (cm)</Label>
                            <Input
                              id="device-width"
                              type="number"
                              value={preferences.constraints.mobilityDevice.width || ''}
                              onChange={(e) => handleMobilityDeviceChange({
                                width: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="device-length">Device Length (cm)</Label>
                            <Input
                              id="device-length"
                              type="number"
                              value={preferences.constraints.mobilityDevice.length || ''}
                              onChange={(e) => handleMobilityDeviceChange({
                                length: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="device-weight">Device Weight (kg)</Label>
                            <Input
                              id="device-weight"
                              type="number"
                              value={preferences.constraints.mobilityDevice.weight || ''}
                              onChange={(e) => handleMobilityDeviceChange({
                                weight: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Device Requirements</h3>
                    
                    <div className="space-y-4">
                      {preferences.constraints.mobilityDevice.type !== 'none' && (
                        <>
                          <BooleanToggle
                            label="Can Fold"
                            checked={preferences.constraints.mobilityDevice.canFold || false}
                            onCheckedChange={(checked) => handleMobilityDeviceChange({
                              canFold: checked
                            })}
                          />
                          
                          <BooleanToggle
                            label="Requires Elevator"
                            checked={preferences.constraints.mobilityDevice.requiresElevator || false}
                            onCheckedChange={(checked) => handleMobilityDeviceChange({
                              requiresElevator: checked
                            })}
                          />
                          
                          <BooleanToggle
                            label="Requires Ramp"
                            checked={preferences.constraints.mobilityDevice.requiresRamp || false}
                            onCheckedChange={(checked) => handleMobilityDeviceChange({
                              requiresRamp: checked
                            })}
                          />
                          
                          <div>
                            <Label htmlFor="max-slope">Maximum Slope (%)</Label>
                            <Input
                              id="max-slope"
                              type="number"
                              step="0.1"
                              value={preferences.constraints.mobilityDevice.maxSlope || ''}
                              onChange={(e) => handleMobilityDeviceChange({
                                maxSlope: e.target.value ? parseFloat(e.target.value) : undefined
                              })}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="min-door-width">Minimum Door Width (cm)</Label>
                            <Input
                              id="min-door-width"
                              type="number"
                              value={preferences.constraints.mobilityDevice.minDoorWidth || ''}
                              onChange={(e) => handleMobilityDeviceChange({
                                minDoorWidth: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Constraints Tab */}
              <TabsContent value="constraints" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Distance Constraints</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="max-walking-distance">Maximum Walking Distance (meters)</Label>
                        <Input
                          id="max-walking-distance"
                          type="number"
                          value={preferences.constraints.maxWalkingDistance || ''}
                          onChange={(e) => handleConstraintsChange({
                            maxWalkingDistance: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="max-cycling-distance">Maximum Cycling Distance (meters)</Label>
                        <Input
                          id="max-cycling-distance"
                          type="number"
                          value={preferences.constraints.maxCyclingDistance || ''}
                          onChange={(e) => handleConstraintsChange({
                            maxCyclingDistance: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="max-stairs">Maximum Stairs</Label>
                        <Input
                          id="max-stairs"
                          type="number"
                          min="0"
                          value={preferences.constraints.maxStairs || ''}
                          onChange={(e) => handleConstraintsChange({
                            maxStairs: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Accessibility Requirements</h3>
                    
                    <div className="space-y-4">
                      <BooleanToggle
                        label="Avoid Stairs"
                        checked={preferences.avoidStairs}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('avoidStairs', checked)}
                      />
                      
                      <BooleanToggle
                        label="Require Wheelchair Accessibility"
                        checked={preferences.requireWheelchairAccessibility}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('requireWheelchairAccessibility', checked)}
                      />
                      
                      <BooleanToggle
                        label="Requires Flat Surface"
                        checked={preferences.constraints.requiresFlatSurface || false}
                        onCheckedChange={(checked) => handleConstraintsChange({
                          requiresFlatSurface: checked
                        })}
                      />
                      
                      <BooleanToggle
                        label="Requires Handrails"
                        checked={preferences.constraints.requiresHandrails || false}
                        onCheckedChange={(checked) => handleConstraintsChange({
                          requiresHandrails: checked
                        })}
                      />
                      
                      <BooleanToggle
                        label="Requires Rest Areas"
                        checked={preferences.constraints.requiresRestAreas || false}
                        onCheckedChange={(checked) => handleConstraintsChange({
                          requiresRestAreas: checked
                        })}
                      />
                      
                      <BooleanToggle
                        label="Requires Accessible Toilets"
                        checked={preferences.constraints.requiresAccessibleToilets || false}
                        onCheckedChange={(checked) => handleConstraintsChange({
                          requiresAccessibleToilets: checked
                        })}
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">Sensory Requirements</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <BooleanToggle
                      label="Visual Impairment"
                      checked={preferences.constraints.visualImpairment || false}
                      onCheckedChange={(checked) => handleConstraintsChange({
                        visualImpairment: checked
                      })}
                    />
                    
                    <BooleanToggle
                      label="Hearing Impairment"
                      checked={preferences.constraints.hearingImpairment || false}
                      onCheckedChange={(checked) => handleConstraintsChange({
                        hearingImpairment: checked
                      })}
                    />
                    
                    <BooleanToggle
                      label="Cognitive Impairment"
                      checked={preferences.constraints.cognitiveImpairment || false}
                      onCheckedChange={(checked) => handleConstraintsChange({
                        cognitiveImpairment: checked
                      })}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* Barriers Tab */}
              <TabsContent value="barriers" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Reported Barriers</h3>
                  <Button onClick={() => setShowBarrierForm(!showBarrierForm)}>
                    {showBarrierForm ? (
                      <>Cancel</>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Report Barrier
                      </>
                    )}
                  </Button>
                </div>
                
                {showBarrierForm && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Report New Barrier</CardTitle>
                      <CardDescription>
                        Report an accessibility barrier to help other users with similar needs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BarrierForm
                        onSubmit={handleAddBarrier}
                        onCancel={() => setShowBarrierForm(false)}
                      />
                    </CardContent>
                  </Card>
                )}
                
                {barriers.length === 0 ? (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>No Barriers Reported</AlertTitle>
                    <AlertDescription>
                      No accessibility barriers have been reported in your area. If you encounter any, please report them to help others.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div>
                    <Alert className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Barriers Detected</AlertTitle>
                      <AlertDescription>
                        The following accessibility barriers have been reported in your area. Routes will be planned to avoid these barriers when possible.
                      </AlertDescription>
                    </Alert>
                    
                    {barriers.map((barrier) => (
                      <BarrierCard
                        key={barrier.id}
                        barrier={barrier}
                        onDelete={handleDeleteBarrier}
                        onUpdate={() => {}} // Placeholder for update functionality
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};