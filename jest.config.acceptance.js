module.exports = {
  ...require('./jest.config.base'),
  roots: ['<rootDir>/acceptance'],
  testTimeout: 5 * 60 * 1000,
};
