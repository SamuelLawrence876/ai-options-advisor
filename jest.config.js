module.exports = {
  ...require('./jest.config.base'),
  roots: ['<rootDir>'],
  testPathIgnorePatterns: ['/node_modules/', '/cdk.out/', '/dist/', '/infrastructure/', '/src/acceptance/'],
};
