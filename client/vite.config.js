import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.dirname(fileURLToPath(import.meta.url))
const publicRoot = path.join(clientRoot, 'public')

function copyAuthoredPublicAssets() {
  return {
    name: 'copy-authored-public-assets',
    apply: 'build',
    closeBundle() {
      const outputRoot = path.join(clientRoot, 'dist')
      fs.cpSync(publicRoot, outputRoot, {
        recursive: true,
        filter(sourcePath) {
          const relativePath = path.relative(publicRoot, sourcePath).replaceAll('\\', '/')
          return relativePath !== 'assets/nro/source' && !relativePath.startsWith('assets/nro/source/')
        },
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: { host: '0.0.0.0' },
  build: {
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'phaser-engine',
              test: /node_modules[\\/]phaser[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    copyAuthoredPublicAssets(),
  ],
})
