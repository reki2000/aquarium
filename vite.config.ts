import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Addons import from 'three'; point that at the WebGPU build so the whole app shares one three instance.
export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: fileURLToPath(new URL('./node_modules/three/build/three.webgpu.js', import.meta.url)),
      },
    ],
  },
  build: {
    target: 'es2022',
    outDir: 'docs',
    // docs also contains checked-in specifications and images.
    emptyOutDir: false,
  },
});
