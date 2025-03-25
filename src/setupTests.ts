import '@testing-library/jest-dom';

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    lastError: null
  },
  storage: {
    local: {
        get: jest.fn().mockImplementation(key => Promise.resolve({ [key]: [] })),
        set: jest.fn()
    }
  }
} as any;

// Mock crypto.randomUUID
global.crypto = {
  ...global.crypto,
  randomUUID: () => 'test-uuid-1234'
} as any;