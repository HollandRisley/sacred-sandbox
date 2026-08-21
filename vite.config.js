import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // three/webgpu, three/tsl and the addons must resolve to one module instance,
  // or the node system ends up with two registries and materials fail to build.
  resolve: { dedupe: ['three'] },
  server: {
    host: true,
    // Honour an assigned PORT when one is supplied, so a second instance can be
    // launched alongside a dev server already holding the default.
    port: Number(process.env.PORT) || 5180,
  },
  build: { target: 'es2022' },
});
