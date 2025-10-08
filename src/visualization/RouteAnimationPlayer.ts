/**
 * Route Animation Player implementation
 * Handles visualization of route progression, animated movement along the route,
 * playback controls, and keyframe-based animations for multi-modal routes.
 */

import {
  AnimationKeyframe,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType,
  RouteVisualization
} from '../types/visualization';

import { MultiModalRoute, RouteSegment } from '../types/routing';
import { PointOfInterest } from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';

/**
 * Animation player states
 */
export enum AnimationPlayerState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  SEEKING = 'seeking'
}

/**
 * Animation playback modes
 */
export enum AnimationPlaybackMode {
  NORMAL = 'normal',
  FAST_FORWARD = 'fast_forward',
  REWIND = 'rewind',
  SLOW_MOTION = 'slow_motion'
}

/**
 * Animation easing types
 */
export enum AnimationEasing {
  LINEAR = 'linear',
  EASE_IN = 'ease_in',
  EASE_OUT = 'ease_out',
  EASE_IN_OUT = 'ease_in_out'
}

/**
 * Animation player controls configuration
 */
export interface AnimationPlayerConfig {
  duration: number; // in milliseconds
  easing: AnimationEasing;
  loop: boolean;
  autoPlay: boolean;
  showControls: boolean;
  showProgress: boolean;
  showTimestamp: boolean;
  playbackSpeed: number; // multiplier (1 = normal speed)
  frameRate: number; // frames per second
  keyframeThreshold: number; // minimum distance between keyframes in meters
}

/**
 * Animation progress data
 */
export interface AnimationProgress {
  currentTime: number; // 0-1
  position: Coordinate;
  segmentIndex: number;
  segmentProgress: number; // 0-1
  speed: number; // current speed in km/h
  heading: number; // in degrees
  distanceTraveled: number; // in meters
  timeElapsed: number; // in seconds
  poi?: PointOfInterest;
  mode: TransportMode;
}

/**
 * Animation event data
 */
export interface AnimationEventData {
  type: AnimationPlayerState;
  progress: AnimationProgress;
  timestamp: Date;
}

/**
 * Animation visualization data
 */
export interface AnimationVisualization {
  id: string;
  route: MultiModalRoute;
  keyframes: AnimationKeyframe[];
  progress: AnimationProgress;
  config: AnimationPlayerConfig;
  state: AnimationPlayerState;
  playbackMode: AnimationPlaybackMode;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalDuration: number; // in seconds
    totalDistance: number; // in meters
  };
}

/**
 * Route Animation Player class
 */
export class RouteAnimationPlayer {
  private currentVisualization: AnimationVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private animationFrame: number | null = null;
  private lastTimestamp: number | null = null;
  private startTime: number | null = null;
  private pausedTime: number | null = null;

  constructor(theme?: VisualizationTheme) {
    this.theme = theme || null;
  }

  /**
   * Set visualization theme
   */
  setTheme(theme: VisualizationTheme): void {
    this.theme = theme;
  }

  /**
   * Create animation visualization from route data
   */
  createVisualization(
    route: MultiModalRoute,
    config?: Partial<AnimationPlayerConfig>
  ): AnimationVisualization {
    const mergedConfig: AnimationPlayerConfig = {
      duration: 10000, // 10 seconds default
      easing: AnimationEasing.LINEAR,
      loop: false,
      autoPlay: false,
      showControls: true,
      showProgress: true,
      showTimestamp: true,
      playbackSpeed: 1,
      frameRate: 60,
      keyframeThreshold: 50, // 50 meters between keyframes
      ...config
    };

    // Generate keyframes for animation
    const keyframes = this.generateKeyframes(route, mergedConfig.keyframeThreshold);

    // Calculate total distance and duration
    const totalDistance = route.totalDistance;
    const totalDuration = route.totalDuration;

    // Create initial progress
    const progress: AnimationProgress = {
      currentTime: 0,
      position: keyframes[0].position,
      segmentIndex: 0,
      segmentProgress: 0,
      speed: 0,
      heading: 0,
      distanceTraveled: 0,
      timeElapsed: 0,
      mode: route.segments[0].mode
    };

    const visualization: AnimationVisualization = {
      id: `animation-viz-${Date.now()}`,
      route,
      keyframes,
      progress,
      config: mergedConfig,
      state: AnimationPlayerState.IDLE,
      playbackMode: AnimationPlaybackMode.NORMAL,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        totalDuration,
        totalDistance
      }
    };

    this.currentVisualization = visualization;

    // Start auto-play if enabled
    if (mergedConfig.autoPlay) {
      this.play();
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'RouteAnimationPlayer'
    });

    return visualization;
  }

  /**
   * Generate keyframes for animation
   */
  private generateKeyframes(route: MultiModalRoute, threshold: number): AnimationKeyframe[] {
    const keyframes: AnimationKeyframe[] = [];
    let accumulatedDistance = 0;
    let accumulatedTime = 0;
    let currentSegmentIndex = 0;
    let currentSegmentProgress = 0;

    // Add initial keyframe
    keyframes.push({
      time: 0,
      position: route.geometry[0],
      segmentId: '0',
      segmentProgress: 0,
      speed: 0,
      heading: 0
    });

    // Generate keyframes along the route
    for (let i = 1; i < route.geometry.length; i++) {
      const prevPoint = route.geometry[i - 1];
      const currentPoint = route.geometry[i];
      const segmentDistance = this.calculateDistance(prevPoint, currentPoint);
      
      accumulatedDistance += segmentDistance;

      // Check if we've moved to a new segment
      while (currentSegmentIndex < route.segments.length) {
        const segment = route.segments[currentSegmentIndex];
        const segmentEnd = this.findPointOnGeometry(route.geometry, segment.toCoordinate);
        
        if (this.calculateDistance(prevPoint, segmentEnd) < segmentDistance) {
          // We've crossed into a new segment
          accumulatedTime += segment.duration;
          currentSegmentIndex++;
          currentSegmentProgress = 0;
          
          // Add keyframe at segment transition
          keyframes.push({
            time: accumulatedTime / route.totalDuration,
            position: segmentEnd,
            segmentId: currentSegmentIndex.toString(),
            segmentProgress: 0,
            poi: this.findPOIAtPosition(route, segmentEnd),
            speed: segment.distance / (segment.duration / 3600), // km/h
            heading: this.calculateHeading(prevPoint, segmentEnd)
          });
        } else {
          // Still in the same segment
          currentSegmentProgress = accumulatedDistance / segment.distance;
          break;
        }
      }

      // Add keyframe if we've exceeded the threshold
      if (accumulatedDistance >= threshold) {
        const timeRatio = accumulatedDistance / route.totalDistance;
        
        keyframes.push({
          time: timeRatio,
          position: currentPoint,
          segmentId: currentSegmentIndex.toString(),
          segmentProgress: currentSegmentProgress,
          poi: this.findPOIAtPosition(route, currentPoint),
          speed: this.calculateSpeed(route, currentSegmentIndex, currentSegmentProgress),
          heading: this.calculateHeading(prevPoint, currentPoint)
        });
        
        accumulatedDistance = 0;
      }
    }

    // Add final keyframe
    keyframes.push({
      time: 1,
      position: route.geometry[route.geometry.length - 1],
      segmentId: (route.segments.length - 1).toString(),
      segmentProgress: 1,
      poi: this.findPOIAtPosition(route, route.geometry[route.geometry.length - 1]),
      speed: 0,
      heading: this.calculateHeading(
        route.geometry[route.geometry.length - 2],
        route.geometry[route.geometry.length - 1]
      )
    });

    return keyframes;
  }

  /**
   * Calculate distance between two coordinates
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Find point on geometry closest to target coordinate
   */
  private findPointOnGeometry(geometry: Coordinate[], target: Coordinate): Coordinate {
    let closestPoint = geometry[0];
    let minDistance = this.calculateDistance(geometry[0], target);

    for (const point of geometry) {
      const distance = this.calculateDistance(point, target);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    return closestPoint;
  }

  /**
   * Find POI at position
   */
  private findPOIAtPosition(route: MultiModalRoute, position: Coordinate): PointOfInterest | undefined {
    // This would check if there's a POI at or near the given position
    // For now, we'll just return undefined
    return undefined;
  }

  /**
   * Calculate speed at segment and progress
   */
  private calculateSpeed(route: MultiModalRoute, segmentIndex: number, progress: number): number {
    if (segmentIndex >= route.segments.length) {
      return 0;
    }

    const segment = route.segments[segmentIndex];
    const distance = segment.distance; // in meters
    const duration = segment.duration; // in seconds
    
    // Speed in km/h
    return (distance / 1000) / (duration / 3600);
  }

  /**
   * Calculate heading between two coordinates
   */
  private calculateHeading(from: Coordinate, to: Coordinate): number {
    const dLon = (to.longitude - from.longitude) * Math.PI / 180;
    const fromLat = from.latitude * Math.PI / 180;
    const toLat = to.latitude * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat) - 
              Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);

    let heading = Math.atan2(y, x) * 180 / Math.PI;
    heading = (heading + 360) % 360;

    return heading;
  }

  /**
   * Start animation playback
   */
  play(): void {
    if (!this.currentVisualization) {
      return;
    }

    if (this.currentVisualization.state === AnimationPlayerState.PAUSED) {
      // Resume from paused state
      this.startTime = Date.now() - (this.pausedTime || 0);
    } else {
      // Start from beginning
      this.startTime = Date.now();
      this.currentVisualization.progress.currentTime = 0;
    }

    this.currentVisualization.state = AnimationPlayerState.PLAYING;
    this.lastTimestamp = null;
    this.pausedTime = null;

    this.emitEvent({
      type: VisualizationEventType.ANIMATION_STARTED,
      timestamp: new Date(),
      data: { state: this.currentVisualization.state, progress: this.currentVisualization.progress },
      source: 'RouteAnimationPlayer'
    });

    this.animate();
  }

  /**
   * Pause animation playback
   */
  pause(): void {
    if (!this.currentVisualization || this.currentVisualization.state !== AnimationPlayerState.PLAYING) {
      return;
    }

    this.currentVisualization.state = AnimationPlayerState.PAUSED;
    this.pausedTime = Date.now() - (this.startTime || 0);

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.emitEvent({
      type: VisualizationEventType.ANIMATION_PAUSED,
      timestamp: new Date(),
      data: { state: this.currentVisualization.state, progress: this.currentVisualization.progress },
      source: 'RouteAnimationPlayer'
    });
  }

  /**
   * Stop animation playback
   */
  stop(): void {
    if (!this.currentVisualization) {
      return;
    }

    this.currentVisualization.state = AnimationPlayerState.STOPPED;
    this.currentVisualization.progress.currentTime = 0;
    this.startTime = null;
    this.pausedTime = null;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Reset progress to beginning
    this.updateProgress(0);

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { state: this.currentVisualization.state, progress: this.currentVisualization.progress },
      source: 'RouteAnimationPlayer'
    });
  }

  /**
   * Seek to specific time in animation
   */
  seek(time: number): void {
    if (!this.currentVisualization || time < 0 || time > 1) {
      return;
    }

    this.currentVisualization.state = AnimationPlayerState.SEEKING;
    this.updateProgress(time);

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { state: this.currentVisualization.state, progress: this.currentVisualization.progress },
      source: 'RouteAnimationPlayer'
    });

    // If we were playing, continue playing from the new position
    if (this.currentVisualization.state === AnimationPlayerState.SEEKING) {
      this.currentVisualization.state = AnimationPlayerState.PLAYING;
      this.startTime = Date.now() - (time * this.currentVisualization.config.duration);
      this.animate();
    }
  }

  /**
   * Set playback speed
   */
  setPlaybackSpeed(speed: number): void {
    if (!this.currentVisualization || speed <= 0) {
      return;
    }

    this.currentVisualization.config.playbackSpeed = speed;

    // If we're playing, adjust the start time to maintain the current position
    if (this.currentVisualization.state === AnimationPlayerState.PLAYING && this.startTime) {
      const elapsed = Date.now() - this.startTime;
      const currentTime = elapsed / this.currentVisualization.config.duration;
      this.startTime = Date.now() - (currentTime * this.currentVisualization.config.duration / speed);
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { speed },
      source: 'RouteAnimationPlayer'
    });
  }

  /**
   * Set playback mode
   */
  setPlaybackMode(mode: AnimationPlaybackMode): void {
    if (!this.currentVisualization) {
      return;
    }

    this.currentVisualization.playbackMode = mode;

    // Adjust playback speed based on mode
    switch (mode) {
      case AnimationPlaybackMode.FAST_FORWARD:
        this.setPlaybackSpeed(2);
        break;
      case AnimationPlaybackMode.REWIND:
        this.setPlaybackSpeed(-1);
        break;
      case AnimationPlaybackMode.SLOW_MOTION:
        this.setPlaybackSpeed(0.5);
        break;
      default:
        this.setPlaybackSpeed(1);
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { mode },
      source: 'RouteAnimationPlayer'
    });
  }

  /**
   * Animation loop
   */
  private animate(): void {
    if (!this.currentVisualization || this.currentVisualization.state !== AnimationPlayerState.PLAYING) {
      return;
    }

    const now = Date.now();
    const elapsed = (now - (this.startTime || now)) * this.currentVisualization.config.playbackSpeed;
    const currentTime = elapsed / this.currentVisualization.config.duration;

    // Check if animation has completed
    if (currentTime >= 1) {
      if (this.currentVisualization.config.loop) {
        // Loop back to beginning
        this.startTime = Date.now();
        this.updateProgress(0);
      } else {
        // Stop at the end
        this.stop();
        this.emitEvent({
          type: VisualizationEventType.ANIMATION_COMPLETED,
          timestamp: new Date(),
          data: { progress: this.currentVisualization.progress },
          source: 'RouteAnimationPlayer'
        });
        return;
      }
    } else {
      this.updateProgress(currentTime);
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  /**
   * Update animation progress
   */
  private updateProgress(currentTime: number): void {
    if (!this.currentVisualization) {
      return;
    }

    // Apply easing function
    const easedTime = this.applyEasing(currentTime, this.currentVisualization.config.easing);

    // Find the current keyframe
    const keyframes = this.currentVisualization.keyframes;
    let prevKeyframe = keyframes[0];
    let nextKeyframe = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (easedTime >= keyframes[i].time && easedTime <= keyframes[i + 1].time) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }

    // Calculate interpolation factor
    const timeRange = nextKeyframe.time - prevKeyframe.time;
    const interpolationFactor = timeRange > 0 ? (easedTime - prevKeyframe.time) / timeRange : 0;

    // Interpolate position
    const position = this.interpolateCoordinate(
      prevKeyframe.position,
      nextKeyframe.position,
      interpolationFactor
    );

    // Update progress
    this.currentVisualization.progress.currentTime = currentTime;
    this.currentVisualization.progress.position = position;
    this.currentVisualization.progress.segmentIndex = parseInt(prevKeyframe.segmentId);
    this.currentVisualization.progress.segmentProgress = prevKeyframe.segmentProgress + 
      (nextKeyframe.segmentProgress - prevKeyframe.segmentProgress) * interpolationFactor;
    this.currentVisualization.progress.speed = prevKeyframe.speed + 
      (nextKeyframe.speed - prevKeyframe.speed) * interpolationFactor;
    this.currentVisualization.progress.heading = this.calculateHeading(prevKeyframe.position, nextKeyframe.position);
    this.currentVisualization.progress.distanceTraveled = currentTime * this.currentVisualization.metadata.totalDistance;
    this.currentVisualization.progress.timeElapsed = currentTime * this.currentVisualization.metadata.totalDuration;
    this.currentVisualization.progress.poi = prevKeyframe.poi;
    this.currentVisualization.progress.mode = this.currentVisualization.route.segments[parseInt(prevKeyframe.segmentId)].mode;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { progress: this.currentVisualization.progress },
      source: 'RouteAnimationPlayer'
    });
  }

  /**
   * Apply easing function
   */
  private applyEasing(time: number, easing: AnimationEasing): number {
    switch (easing) {
      case AnimationEasing.LINEAR:
        return time;
      case AnimationEasing.EASE_IN:
        return time * time;
      case AnimationEasing.EASE_OUT:
        return 1 - (1 - time) * (1 - time);
      case AnimationEasing.EASE_IN_OUT:
        return time < 0.5 
          ? 2 * time * time 
          : 1 - Math.pow(-2 * time + 2, 2) / 2;
      default:
        return time;
    }
  }

  /**
   * Interpolate between two coordinates
   */
  private interpolateCoordinate(coord1: Coordinate, coord2: Coordinate, factor: number): Coordinate {
    return {
      latitude: coord1.latitude + (coord2.latitude - coord1.latitude) * factor,
      longitude: coord1.longitude + (coord2.longitude - coord1.longitude) * factor
    };
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): AnimationVisualization | null {
    return this.currentVisualization;
  }

  /**
   * Get current animation progress
   */
  getCurrentProgress(): AnimationProgress | null {
    return this.currentVisualization?.progress || null;
  }

  /**
   * Get current player state
   */
  getCurrentState(): AnimationPlayerState | null {
    return this.currentVisualization?.state || null;
  }

  /**
   * Add event listener
   */
  addEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    
    this.eventListeners.get(type)!.push(handler);
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: VisualizationEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(handler => handler(event));
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}