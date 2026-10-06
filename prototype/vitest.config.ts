// Unit tests for the apps and their build (npm test). The database has its own suite: npm run test:backend.
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, 'shared/src') } },
  test: {
    include: ['shared/**/*.test.{ts,tsx}', 'staff-app/src/**/*.test.{ts,tsx}', 'guest-portal/src/**/*.test.{ts,tsx}'],
    environment: 'node',   // component tests opt in with a `// @vitest-environment jsdom` first line
  },
})
