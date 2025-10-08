/**
 * Preference Configurator Component
 * Main component for configuring user preferences with real-time preview
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { PreferenceManager } from '../../preferences/PreferenceManager';
import { ProfileManager, ProfileContext } from '../../preferences/ProfileManager';
import { AccessibilityManager } from '../../preferences/AccessibilityManager';
import { 
  DetailedUserPreferences, 
  PreferenceCategory, 
  UserConstraints, 
  MobilityDevice,
  UserProfileTemplate 
} from '../../types/preferences';
import { TransportMode } from '../../types/graph';

interface PreferenceConfiguratorProps {
  userId: string;
  onPreferencesChange?: (preferences: DetailedUserPreferences) => void;
  onProfileChange?: (profileId: string) => void;
}

export const PreferenceConfigurator: React.FC<PreferenceConfiguratorProps> = ({
  userId,
  onPreferencesChange,
  onProfileChange
}) => {
  const [preferenceManager] = useState(() => PreferenceManager.getInstance());
  const [profileManager] = useState(() => new ProfileManager(preferenceManager));
  const [accessibilityManager] = useState(() => new AccessibilityManager(null as any));
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeProfile, setActiveProfile] = useState<UserProfileTemplate | null>(null);
  const [preferences, setPreferences] = useState<DetailedUserPreferences | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState('weights');

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = () => {
    const profile = preferenceManager.getUserProfile(userId);
    if (profile) {
      setUserProfile(profile);
      const activePref = profileManager.getActiveProfile(userId);
      setActiveProfile(activePref);
      setPreferences(activePref ? activePref.preferences : null);
      setUnsavedChanges(false);
    }
  };

  const handleWeightsChange = (category: PreferenceCategory, value: number) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      weights: {
        ...preferences.weights,
        [category]: value
      }
    };
    
    // Normalize weights to ensure they sum to 1
    const totalWeight = Object.values(newPreferences.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      const scale = 1.0 / totalWeight;
      Object.keys(newPreferences.weights).forEach(key => {
        newPreferences.weights[key as keyof typeof newPreferences.weights] *= scale;
      });
    }
    
    setPreferences(newPreferences);
    setUnsavedChanges(true);
    
    if (previewMode) {
      onPreferencesChange?.(newPreferences);
    }
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
    setUnsavedChanges(true);
    
    if (previewMode) {
      onPreferencesChange?.(newPreferences);
    }
  };

  const handleTransportModesChange = (transportModes: any) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      transportModes: {
        ...preferences.transportModes,
        ...transportModes
      }
    };
    
    setPreferences(newPreferences);
    setUnsavedChanges(true);
    
    if (previewMode) {
      onPreferencesChange?.(newPreferences);
    }
  };

  const handleBooleanPreferenceChange = (key: keyof DetailedUserPreferences, value: boolean) => {
    if (!preferences) return;
    
    const newPreferences = {
      ...preferences,
      [key]: value
    };
    
    setPreferences(newPreferences);
    setUnsavedChanges(true);
    
    if (previewMode) {
      onPreferencesChange?.(newPreferences);
    }
  };

  const handleSavePreferences = () => {
    if (!preferences || !activeProfile) return;
    
    const success = preferenceManager.updatePreferenceProfile(
      userId,
      activeProfile.id,
      { preferences }
    );
    
    if (success) {
      setUnsavedChanges(false);
      // Force reload to get updated preferences
      loadUserProfile();
    }
  };

  const handleResetPreferences = () => {
    if (!activeProfile) return;
    
    const template = preferenceManager.getProfileTemplate('commuter');
    if (template) {
      setPreferences(template.preferences);
      setUnsavedChanges(true);
    }
  };

  const handleProfileChange = (profileId: string) => {
    const success = profileManager.setActiveProfile(userId, profileId);
    if (success) {
      loadUserProfile();
      onProfileChange?.(profileId);
    }
  };

  const handleCreateProfile = () => {
    const name = prompt('Enter profile name:');
    if (!name) return;
    
    const description = prompt('Enter profile description:') || '';
    const profileId = profileManager.createPreferenceProfile(userId, name, description);
    
    if (profileId) {
      handleProfileChange(profileId);
    }
  };

  const handleDeleteProfile = () => {
    if (!activeProfile || activeProfile.isDefault) return;
    
    if (confirm(`Are you sure you want to delete the "${activeProfile.name}" profile?`)) {
      profileManager.deletePreferenceProfile(userId, activeProfile.id);
      loadUserProfile();
    }
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
    setUnsavedChanges(true);
    
    if (previewMode) {
      onPreferencesChange?.(newPreferences);
    }
  };

  const WeightSlider: React.FC<{
    category: PreferenceCategory;
    value: number;
    onChange: (value: number) => void;
  }> = ({ category, value, onChange }) => (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label htmlFor={`weight-${category}`} className="capitalize">
          {category.replace('_', ' ')}
        </Label>
        <span className="text-sm text-muted-foreground">{(value * 100).toFixed(0)}%</span>
      </div>
      <Slider
        id={`weight-${category}`}
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
        className="w-full"
      />
    </div>
  );

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

  if (!userProfile || !preferences) {
    return <div>Loading preferences...</div>;
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Route Preferences</h1>
            <p className="text-muted-foreground">
              Customize your routing experience based on your preferences and needs
            </p>
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant={previewMode ? "default" : "outline"}
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? "Exit Preview" : "Preview Routes"}
            </Button>
            
            {unsavedChanges && (
              <Button onClick={handleSavePreferences}>
                Save Changes
              </Button>
            )}
          </div>
        </div>

        {/* Profile Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile Selection</CardTitle>
            <CardDescription>
              Select or create a preference profile for different contexts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={activeProfile?.id || ""} onValueChange={handleProfileChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a profile" />
                </SelectTrigger>
                <SelectContent>
                  {userProfile.profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button variant="outline" onClick={handleCreateProfile}>
                Create New Profile
              </Button>
              
              {activeProfile && !activeProfile.isDefault && (
                <Button variant="outline" onClick={handleDeleteProfile}>
                  Delete Profile
                </Button>
              )}
              
              {unsavedChanges && (
                <Badge variant="secondary">Unsaved Changes</Badge>
              )}
            </div>
            
            {activeProfile && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">{activeProfile.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preference Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Preference Configuration</CardTitle>
            <CardDescription>
              Adjust your routing preferences and constraints
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="weights">Weights</TabsTrigger>
                <TabsTrigger value="constraints">Constraints</TabsTrigger>
                <TabsTrigger value="transport">Transport</TabsTrigger>
                <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
              </TabsList>
              
              {/* Weights Tab */}
              <TabsContent value="weights" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Priority Weights</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Adjust the importance of each factor in route calculations
                    </p>
                    
                    <div className="space-y-4">
                      <WeightSlider
                        category={PreferenceCategory.SPEED}
                        value={preferences.weights.speed}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.SPEED, value)}
                      />
                      
                      <WeightSlider
                        category={PreferenceCategory.SAFETY}
                        value={preferences.weights.safety}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.SAFETY, value)}
                      />
                      
                      <WeightSlider
                        category={PreferenceCategory.ACCESSIBILITY}
                        value={preferences.weights.accessibility}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.ACCESSIBILITY, value)}
                      />
                      
                      <WeightSlider
                        category={PreferenceCategory.COST}
                        value={preferences.weights.cost}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.COST, value)}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Additional Factors</h3>
                    
                    <div className="space-y-4">
                      <WeightSlider
                        category={PreferenceCategory.ENVIRONMENT}
                        value={preferences.weights.environment}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.ENVIRONMENT, value)}
                      />
                      
                      <WeightSlider
                        category={PreferenceCategory.COMFORT}
                        value={preferences.weights.comfort}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.COMFORT, value)}
                      />
                      
                      <WeightSlider
                        category={PreferenceCategory.SCENIC}
                        value={preferences.weights.scenic}
                        onChange={(value) => handleWeightsChange(PreferenceCategory.SCENIC, value)}
                      />
                    </div>
                    
                    <div className="mt-6">
                      <Button variant="outline" onClick={handleResetPreferences}>
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Constraints Tab */}
              <TabsContent value="constraints" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Time Constraints</h3>
                    
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
                        <Label htmlFor="max-time">Maximum Travel Time (minutes)</Label>
                        <Input
                          id="max-time"
                          type="number"
                          value={preferences.constraints.timeConstraints?.maxTotalTime 
                            ? Math.floor(preferences.constraints.timeConstraints.maxTotalTime / 60) 
                            : ''}
                          onChange={(e) => handleConstraintsChange({
                            timeConstraints: {
                              ...preferences.constraints.timeConstraints,
                              maxTotalTime: e.target.value ? parseInt(e.target.value) * 60 : undefined
                            }
                          })}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Route Options</h3>
                    
                    <div className="space-y-4">
                      <BooleanToggle
                        label="Avoid Tolls"
                        checked={preferences.avoidTolls}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('avoidTolls', checked)}
                      />
                      
                      <BooleanToggle
                        label="Avoid Highways"
                        checked={preferences.avoidHighways}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('avoidHighways', checked)}
                      />
                      
                      <BooleanToggle
                        label="Avoid Ferries"
                        checked={preferences.avoidFerries}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('avoidFerries', checked)}
                      />
                      
                      <BooleanToggle
                        label="Avoid Unpaved Roads"
                        checked={preferences.avoidUnpavedRoads}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('avoidUnpavedRoads', checked)}
                      />
                      
                      <BooleanToggle
                        label="Minimize Transfers"
                        checked={preferences.minimizeTransfers}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('minimizeTransfers', checked)}
                      />
                      
                      <BooleanToggle
                        label="Prefer Scenic Routes"
                        checked={preferences.preferScenicRoutes}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('preferScenicRoutes', checked)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Transport Tab */}
              <TabsContent value="transport" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Preferred Transport Modes</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select your preferred transport modes for routing
                    </p>
                    
                    <div className="space-y-2">
                      {Object.values(TransportMode).map((mode) => (
                        <BooleanToggle
                          key={mode}
                          label={mode.replace('_', ' ')}
                          checked={preferences.transportModes.preferredModes.includes(mode)}
                          onCheckedChange={(checked) => {
                            const currentModes = [...preferences.transportModes.preferredModes];
                            const newModes = checked
                              ? [...currentModes, mode]
                              : currentModes.filter(m => m !== mode);
                            
                            handleTransportModesChange({
                              preferredModes: newModes
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Transport Options</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="max-transfers">Maximum Transfers</Label>
                        <Input
                          id="max-transfers"
                          type="number"
                          min="0"
                          value={preferences.transportModes.maxTransfers || ''}
                          onChange={(e) => handleTransportModesChange({
                            maxTransfers: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="min-transfer-time">Minimum Transfer Time (seconds)</Label>
                        <Input
                          id="min-transfer-time"
                          type="number"
                          min="0"
                          value={preferences.transportModes.minTransferTime || ''}
                          onChange={(e) => handleTransportModesChange({
                            minTransferTime: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                        />
                      </div>
                      
                      <BooleanToggle
                        label="Require Bike Lanes"
                        checked={preferences.requireBikeLane}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('requireBikeLane', checked)}
                      />
                      
                      <BooleanToggle
                        label="Require Sidewalks"
                        checked={preferences.requireSidewalk}
                        onCheckedChange={(checked) => handleBooleanPreferenceChange('requireSidewalk', checked)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Accessibility Tab */}
              <TabsContent value="accessibility" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Mobility Device</h3>
                    
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
                        </>
                      )}
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
                      
                      {preferences.constraints.mobilityDevice.type !== 'none' && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};