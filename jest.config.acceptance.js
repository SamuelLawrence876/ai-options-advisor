module.exports = {
  ...require('./jest.config.base'),
  roots: ['<rootDir>/acceptance'],
  testTimeout: 10 * 60 * 1000,
};
