declare module 'rollup-plugin-visualizer' {
  export const visualizer: (options?: any) => any;
}

interface ImportMetaEnv {
  readonly VITE_MP_PUBLIC_KEY?: string;
  readonly VITE_GCAL_CLIENT_ID?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
