import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // The simulator imports the shared caddie engine from the Expo app. Force
  // web-safe compiler settings so Vite never tries to resolve Expo's tsconfig.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        jsx: 'react-jsx',
      },
    },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
});
