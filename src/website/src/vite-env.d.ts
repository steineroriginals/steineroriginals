/// <reference types="vite/client" />

declare const __PUBLIC_R2_BASE_URL__: string;

declare module "*?url" {
  const url: string;
  export default url;
}
