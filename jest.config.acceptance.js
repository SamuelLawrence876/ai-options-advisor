module.exports = {
  ...require('./jest.config.base'),
  roots: ['<rootDir>/src/acceptance'],
  testTimeout: 30000,
};
