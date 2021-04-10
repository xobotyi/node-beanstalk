module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: './coverage',
  collectCoverage: false,
  collectCoverageFrom: ['src/**/*.ts'],
};
