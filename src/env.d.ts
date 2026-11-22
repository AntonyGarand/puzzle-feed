/** Injected by vite.config.ts: "<short sha> · <build date>". */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "android" for the bundled Android build (npm run build:android), unset on the website. */
  readonly VITE_PLATFORM?: string;
}
