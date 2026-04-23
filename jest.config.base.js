module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  automock: false,
  clearMocks: true,
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { isolatedModules: true }],
  },
  setupFiles: ['./jest.setup.js'],
};
