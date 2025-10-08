/**
 * Profile Selector Component
 * Allows users to quickly switch between different preference profiles
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Separator } from '../ui/separator';
import { ProfileManager, ProfileContext } from '../../preferences/ProfileManager';
import { PreferenceManager } from '../../preferences/PreferenceManager';
import { UserProfileTemplate } from '../../types/preferences';
import { Clock, MapPin, Star, Settings } from 'lucide-react';

interface ProfileSelectorProps {
  userId: string;
  onProfileChange?: (profileId: string) => void;
  showStats?: boolean;
  compact?: boolean;
}

interface ProfileCardProps {
  profile: UserProfileTemplate;
  isActive: boolean;
  usageCount?: number;
  lastUsed?: Date;
  onClick: () => void;
  onEdit?: () => void;
  compact?: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  isActive,
  usageCount,
  lastUsed,
  onClick,
  onEdit,
  compact
}) => {
  const getProfileIcon = (profileName: string): string => {
    if (profileName.toLowerCase().includes('commute')) return '🚇';
    if (profileName.toLowerCase().includes('tourist')) return '📸';
    if (profileName.toLowerCase().includes('access')) return '♿';
    if (profileName.toLowerCase().includes('eco')) return '🌿';
    return '👤';
  };

  if (compact) {
    return (
      <div
        className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
          isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'
        }`}
        onClick={onClick}
      >
        <div className="flex items-center space-x-3">
          <div className="text-xl">{getProfileIcon(profile.name)}</div>
          <div>
            <div className="font-medium">{profile.name}</div>
            {isActive && <Badge variant="secondary" className="text-xs">Active</Badge>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isActive ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{getProfileIcon(profile.name)}</div>
            <div>
              <CardTitle className="text-lg">{profile.name}</CardTitle>
              {isActive && <Badge variant="secondary">Active</Badge>}
            </div>
          </div>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{profile.description}</CardDescription>
      </CardHeader>
      
      {(usageCount !== undefined || lastUsed) && (
        <CardContent className="pt-0">
          <div className="flex justify-between text-sm text-muted-foreground">
            {usageCount !== undefined && (
              <div className="flex items-center space-x-1">
                <Star className="h-3 w-3" />
                <span>{usageCount} uses</span>
              </div>
            )}
            {lastUsed && (
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{lastUsed.toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  userId,
  onProfileChange,
  showStats = false,
  compact = false
}) => {
  const [preferenceManager] = useState(() => PreferenceManager.getInstance());
  const [profileManager] = useState(() => new ProfileManager(preferenceManager));
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeProfile, setActiveProfile] = useState<UserProfileTemplate | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfileTemplate[]>([]);
  const [usageStats, setUsageStats] = useState<Map<string, { count: number; lastUsed: Date }>>(new Map());
  const [contextProfiles, setContextProfiles] = useState<Map<ProfileContext, string>>(new Map());
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = () => {
    const profile = preferenceManager.getUserProfile(userId);
    if (profile) {
      setUserProfile(profile);
      const activePref = profileManager.getActiveProfile(userId);
      setActiveProfile(activePref);
      setAllProfiles(profile.profiles);
      
      if (showStats) {
        const stats = profileManager.getAllUsageStats(userId);
        const statsMap = new Map<string, { count: number; lastUsed: Date }>();
        stats.forEach(stat => {
          statsMap.set(stat.profileId, {
            count: stat.usageCount,
            lastUsed: stat.lastUsed
          });
        });
        setUsageStats(statsMap);
      }
      
      // Load context profiles
      const contexts = Object.values(ProfileContext);
      const contextMap = new Map<ProfileContext, string>();
      contexts.forEach(context => {
        const contextProfile = profileManager.getContextProfile(userId, context);
        if (contextProfile) {
          contextMap.set(context, contextProfile.id);
        }
      });
      setContextProfiles(contextMap);
    }
  };

  const handleProfileChange = (profileId: string) => {
    const success = profileManager.setActiveProfile(userId, profileId);
    if (success) {
      loadUserProfile();
      onProfileChange?.(profileId);
      setIsPopoverOpen(false);
    }
  };

  const handleContextProfileChange = (context: ProfileContext, profileId: string) => {
    const success = profileManager.setContextProfile(userId, context, profileId);
    if (success) {
      loadUserProfile();
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

  const getContextIcon = (context: ProfileContext): string => {
    switch (context) {
      case ProfileContext.COMMUTING: return '🚇';
      case ProfileContext.LEISURE: return '🎮';
      case ProfileContext.BUSINESS: return '💼';
      case ProfileContext.EMERGENCY: return '🚨';
      case ProfileContext.TOURISM: return '📸';
      case ProfileContext.EXERCISE: return '🏃';
      case ProfileContext.SHOPPING: return '🛒';
      case ProfileContext.SOCIAL: return '👥';
      default: return '📍';
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              {activeProfile ? (
                <>
                  <span className="mr-2">
                    {activeProfile.name.toLowerCase().includes('commute') ? '🚇' :
                     activeProfile.name.toLowerCase().includes('tourist') ? '📸' :
                     activeProfile.name.toLowerCase().includes('access') ? '♿' :
                     activeProfile.name.toLowerCase().includes('eco') ? '🌿' : '👤'}
                  </span>
                  {activeProfile.name}
                </>
              ) : (
                'Select Profile'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Profiles</h4>
                <Button variant="ghost" size="sm" onClick={handleCreateProfile}>
                  New
                </Button>
              </div>
              
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {allProfiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    isActive={activeProfile?.id === profile.id}
                    usageCount={usageStats.get(profile.id)?.count}
                    lastUsed={usageStats.get(profile.id)?.lastUsed}
                    onClick={() => handleProfileChange(profile.id)}
                    compact={true}
                  />
                ))}
              </div>
              
              {contextProfiles.size > 0 && (
                <>
                  <Separator />
                  <h4 className="font-medium">Context Profiles</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from(contextProfiles.entries()).map(([context, profileId]) => {
                      const profile = allProfiles.find(p => p.id === profileId);
                      if (!profile) return null;
                      
                      return (
                        <Tooltip key={context}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="justify-start"
                              onClick={() => handleProfileChange(profileId)}
                            >
                              <span className="mr-1">{getContextIcon(context)}</span>
                              <span className="truncate">{profile.name}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{context.replace('_', ' ')}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Preference Profiles</CardTitle>
          <CardDescription>
            Switch between different preference profiles for various contexts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Your Profiles</h4>
              <Button onClick={handleCreateProfile} size="sm">
                Create New
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allProfiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={activeProfile?.id === profile.id}
                  usageCount={usageStats.get(profile.id)?.count}
                  lastUsed={usageStats.get(profile.id)?.lastUsed}
                  onClick={() => handleProfileChange(profile.id)}
                />
              ))}
            </div>
            
            {contextProfiles.size > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Context Profiles</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Array.from(contextProfiles.entries()).map(([context, profileId]) => {
                      const profile = allProfiles.find(p => p.id === profileId);
                      if (!profile) return null;
                      
                      return (
                        <Tooltip key={context}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              className="flex flex-col items-center p-3 h-auto"
                              onClick={() => handleProfileChange(profileId)}
                            >
                              <span className="text-2xl mb-1">{getContextIcon(context)}</span>
                              <span className="text-xs text-center">{profile.name}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{context.replace('_', ' ')}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Quick Context Switch</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.values(ProfileContext).map((context) => {
                  const profileId = contextProfiles.get(context);
                  const profile = profileId ? allProfiles.find(p => p.id === profileId) : null;
                  
                  return (
                    <Tooltip key={context}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={profile ? "default" : "outline"}
                          className="flex flex-col items-center p-3 h-auto"
                          onClick={() => {
                            if (profile) {
                              handleProfileChange(profile.id);
                            } else {
                              // Set context for active profile
                              if (activeProfile) {
                                handleContextProfileChange(context, activeProfile.id);
                              }
                            }
                          }}
                        >
                          <span className="text-2xl mb-1">{getContextIcon(context)}</span>
                          <span className="text-xs text-center">
                            {context.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{context.replace('_', ' ')}</p>
                        {profile && <p className="text-xs">Uses: {profile.name}</p>}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};