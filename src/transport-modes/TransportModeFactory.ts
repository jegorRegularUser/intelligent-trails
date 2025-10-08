/**
 * Factory for creating transport mode handlers
 * Implements the factory pattern to create appropriate handlers for each transport mode
 */

import { TransportMode } from '../types/graph';
import { TransportModeHandler } from './TransportModeHandler';

/**
 * Registry of transport mode handlers
 */
export class TransportModeRegistry {
  private static handlers: Map<TransportMode, new () => TransportModeHandler> = new Map();

  /**
   * Register a transport mode handler
   * @param mode The transport mode
   * @param handlerClass The handler class
   */
  static register(mode: TransportMode, handlerClass: new () => TransportModeHandler): void {
    this.handlers.set(mode, handlerClass);
  }

  /**
   * Get a transport mode handler class
   * @param mode The transport mode
   * @returns The handler class or undefined if not found
   */
  static getHandlerClass(mode: TransportMode): new () => TransportModeHandler | undefined {
    return this.handlers.get(mode);
  }

  /**
   * Get all registered transport modes
   * @returns Array of registered transport modes
   */
  static getRegisteredModes(): TransportMode[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a transport mode is registered
   * @param mode The transport mode
   * @returns True if the mode is registered
   */
  static isRegistered(mode: TransportMode): boolean {
    return this.handlers.has(mode);
  }
}

/**
 * Factory for creating transport mode handlers
 */
export class TransportModeFactory {
  /**
   * Create a transport mode handler
   * @param mode The transport mode
   * @returns The transport mode handler
   * @throws Error if the handler is not registered
   */
  static createHandler(mode: TransportMode): TransportModeHandler {
    const HandlerClass = TransportModeRegistry.getHandlerClass(mode);
    
    if (!HandlerClass) {
      throw new Error(`No handler registered for transport mode: ${mode}`);
    }
    
    return new HandlerClass();
  }

  /**
   * Create multiple transport mode handlers
   * @param modes The transport modes
   * @returns Array of transport mode handlers
   */
  static createHandlers(modes: TransportMode[]): TransportModeHandler[] {
    return modes.map(mode => this.createHandler(mode));
  }

  /**
   * Get all available transport mode handlers
   * @returns Array of all available transport mode handlers
   */
  static createAllHandlers(): TransportModeHandler[] {
    const modes = TransportModeRegistry.getRegisteredModes();
    return this.createHandlers(modes);
  }
}

/**
 * Transport mode compatibility checker
 */
export class TransportModeCompatibility {
  /**
   * Check if two transport modes are compatible for transfer
   * @param fromMode The source transport mode
   * @param toMode The target transport mode
   * @returns True if the modes are compatible for transfer
   */
  static areModesCompatible(fromMode: TransportMode, toMode: TransportMode): boolean {
    // Same mode is always compatible
    if (fromMode === toMode) {
      return true;
    }

    // Define compatibility matrix
    const compatibilityMatrix: Record<TransportMode, TransportMode[]> = {
      [TransportMode.WALKING]: [
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAM,
        TransportMode.TRAIN,
        TransportMode.FERRY
      ],
      [TransportMode.BICYCLE]: [
        TransportMode.WALKING,
        TransportMode.CAR,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAM,
        TransportMode.TRAIN
      ],
      [TransportMode.CAR]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAM,
        TransportMode.TRAIN
      ],
      [TransportMode.BUS]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.METRO,
        TransportMode.TRAM,
        TransportMode.TRAIN
      ],
      [TransportMode.METRO]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.BUS,
        TransportMode.TRAM,
        TransportMode.TRAIN
      ],
      [TransportMode.TRAM]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAIN
      ],
      [TransportMode.TRAIN]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAM,
        TransportMode.FERRY
      ],
      [TransportMode.FERRY]: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.CAR,
        TransportMode.TRAIN
      ]
    };

    return compatibilityMatrix[fromMode]?.includes(toMode) || false;
  }

  /**
   * Get all transport modes compatible with a given mode
   * @param mode The transport mode
   * @returns Array of compatible transport modes
   */
  static getCompatibleModes(mode: TransportMode): TransportMode[] {
    return Object.values(TransportMode).filter(m => 
      m !== mode && this.areModesCompatible(mode, m)
    );
  }

  /**
   * Check if a sequence of transport modes is valid
   * @param modes The sequence of transport modes
   * @returns True if the sequence is valid
   */
  static isModeSequenceValid(modes: TransportMode[]): boolean {
    if (modes.length <= 1) {
      return true;
    }

    for (let i = 0; i < modes.length - 1; i++) {
      if (!this.areModesCompatible(modes[i], modes[i + 1])) {
        return false;
      }
    }

    return true;
  }
}