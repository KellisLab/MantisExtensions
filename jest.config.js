/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    "~/(.*)": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/style.mock.js",
    "\\.(gif|ttf|eot|svg|png)$": "<rootDir>/__mocks__/file.mock.js"
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      useESM: true,
    }],
    "^.+\\.jsx?$": ["babel-jest", { 
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-react',
      ]
    }]
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
};

export default config;