import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build flavors are Vite modes: web | native | crazygames | youtube | e2e | dev.
// Each mode reads `.env.<mode>` (VITE_FLAVOR, VITE_AD_PROVIDER, VITE_DEBUG_HOOKS).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const flavor = env.VITE_FLAVOR || 'web';
  const plugins: PluginOption[] = [];

  if (flavor === 'web' && mode !== 'dev') {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Crop Crawler',
          short_name: 'Crop Crawler',
          description: 'Hold to crawl, munch crops, merge your robot caterpillar!',
          lang: 'en',
          display: 'fullscreen',
          orientation: 'portrait',
          background_color: '#7cc56b',
          theme_color: '#7cc56b',
          start_url: './',
          scope: './',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
        },
      }),
    );
  }

  if (flavor === 'youtube') {
    // The Playables SDK must be the first script on the page.
    plugins.push({
      name: 'inject-youtube-playables-sdk',
      transformIndexHtml: {
        order: 'pre',
        handler: (html: string) =>
          html.replace('<head>', '<head>\n    <script src="https://www.youtube.com/game_api/v1"></script>'),
      },
    });
  }

  return {
    base: './',
    plugins,
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    build: {
      outDir: `dist/${mode}`,
      emptyOutDir: true,
      target: ['es2022', 'chrome100', 'safari15'],
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
    },
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
  };
});
