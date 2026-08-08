/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_AUTH_SEED_EMAIL?: string;
  readonly VITE_LOCAL_AUTH_SEED_PASSWORD?: string;
  readonly VITE_LOCAL_AUTH_SEED_ROLE?: string;
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_DATABASE_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.wasm?url" {
  const src: string;
  export default src;
}
