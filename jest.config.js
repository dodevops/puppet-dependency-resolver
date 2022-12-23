/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  setupFilesAfterEnv: ['@alex_neo/jest-expect-message', './test/log.setup.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
}
