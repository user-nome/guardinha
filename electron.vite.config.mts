import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const root = import.meta.dirname;

/** Espelha `paths` de tsconfig.base.json e o mapa de `node.loader.ts`. */
const sharedAliases = {
  '@zero/types': resolve(root, 'src/types'),
  '@zero/messages': resolve(root, 'src/messages'),
  '@zero/shared': resolve(root, 'src/shared'),
} as const;

export default defineConfig({
  main: {
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/main': resolve(root, 'src/main'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/preload': resolve(root, 'src/preload'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'src/preload/index.ts'),
        output: {
          // Preload sandboxed não tem loader ESM no Electron: precisa sair como
          // CommonJS (`.cjs`), mesmo com `package.json` em `"type": "module"`.
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    server: {
      fs: {
        allow: [root],
      },
    },
    resolve: {
      alias: {
        ...sharedAliases,
        '@zero/renderer': resolve(root, 'src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(root, 'src/renderer/index.html'),
      },
    },
  },
});
