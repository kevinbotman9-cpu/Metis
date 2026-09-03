module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/packages', '<rootDir>/planes', '<rootDir>/bench'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'packages/**/src/**/*.ts',
    'planes/**/src/**/*.ts',
    'bench/**/src/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  moduleNameMapper: {
    '^@metis/(.*)$': '<rootDir>/packages/$1/src',
    '^@planes/(.*)$': '<rootDir>/planes/$1/src',
    '^@bench/(.*)$': '<rootDir>/bench/$1/src',
  },
};
