module.exports = {
  ...require('./jest.config.base'),
  roots: ['<rootDir>/acceptance'],
  maxWorkers: 1,
  testTimeout: 10 * 60 * 1000,
};
