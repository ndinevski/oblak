/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_IMPULS_URL: string;
  readonly VITE_IZVOR_URL: string;
  readonly VITE_SPOMEN_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
