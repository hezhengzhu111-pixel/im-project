module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@noble)/)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/src/e2ee/__tests__/helpers/',
    '<rootDir>/src/e2ee/__tests__/fixtures/',
    '<rootDir>/src/e2ee/__tests__/mocks/',
  ],
};
