import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'
import { browserEnvGuard } from '../shared/vite/envGuard'

export default defineConfig({
  // iPad check-in app. Single-file build: JS + CSS are inlined so dist/index.html opens by double-click (file://).
  // browserEnvGuard: stops the build if a secret key would end up in the browser (docs/keys-and-secrets.md).
  plugins: [browserEnvGuard(), react(), viteSingleFile()],
  base: './',
  publicDir: path.resolve(__dirname, '../shared/public'),
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared/src') } },
  // Older Safari support; IIFE so the inlined script runs as a classic <script> (no module loading on file://).
  build: { target: ['safari13', 'es2019'], rollupOptions: { output: { format: 'iife' } } },
  // /api goes to the demo sync server on this computer, so iPads on the same Wi-Fi reach it through Vite.
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
