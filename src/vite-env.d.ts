/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLAVOR: 'web' | 'native' | 'crazygames' | 'youtube';
  readonly VITE_AD_PROVIDER: 'none' | 'devstub' | 'admob' | 'crazygames' | 'youtube';
  readonly VITE_DEBUG_HOOKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
