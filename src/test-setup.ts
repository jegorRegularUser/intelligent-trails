/**
 * Test setup file for Jest
 * This file runs before all tests
 */

// Import Jest
const jest = require('jest');

// Mock console methods to reduce noise during tests
(global as any).console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock window and document objects for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
(global as any).ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock scrollTo
window.scrollTo = jest.fn();

// Set up performance API if not available
if (!global.performance) {
  global.performance = {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByName: jest.fn(),
    getEntriesByType: jest.fn(),
    getEntries: jest.fn(),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
    setResourceTimingBufferSize: jest.fn(),
    toJSON: jest.fn(),
    timeOrigin: 0,
    timing: {} as any,
    navigation: {} as any,
  } as unknown as Performance;
}

// Set up requestAnimationFrame
global.requestAnimationFrame = jest.fn(callback => {
  return setTimeout(callback, 0);
});

global.cancelAnimationFrame = jest.fn(id => {
  clearTimeout(id);
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
(global as any).localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
(global as any).sessionStorage = sessionStorageMock;

// Set up global test utilities

// Extend Jest matchers
jest.expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Add custom test utilities
global.testUtils = {
  // Create a mock function that returns a promise
  mockAsyncFunction: <T>(result: T) => jest.fn().mockResolvedValue(result),
  
  // Create a mock function that rejects
  mockRejectingFunction: (error: Error) => jest.fn().mockRejectedValue(error),
  
  // Create a mock function with multiple return values
  mockMultiReturnFunction: <T>(values: T[]) => {
    const mockFn = jest.fn();
    values.forEach((value, index) => {
      mockFn.mockReturnValueOnce(value);
    });
    return mockFn;
  },
  
  // Wait for a specified amount of time
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create a mock event
  createMockEvent: (type: string, data: any = {}) => ({
    type,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...data,
  }),
  
  // Create a mock DOM element
  createMockElement: (tagName: string, attributes: Record<string, any> = {}) => {
    const element = {
      tagName,
      attributes,
      getAttribute: jest.fn((name: string) => attributes[name]),
      setAttribute: jest.fn((name: string, value: string) => {
        attributes[name] = value;
      }),
      hasAttribute: jest.fn((name: string) => name in attributes),
      removeAttribute: jest.fn((name: string) => {
        delete attributes[name];
      }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(),
        toggle: jest.fn(),
      },
      style: {},
      children: [],
      parentNode: null,
      parentElement: null,
    };
    return element;
  },
};