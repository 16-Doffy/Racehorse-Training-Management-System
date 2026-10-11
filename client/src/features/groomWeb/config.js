// Temporary test UI. Production stays mobile-only unless explicitly enabled at build time.
export const GROOM_WEB_ENABLED = import.meta.env.VITE_ENABLE_GROOM_WEB === undefined
  ? import.meta.env.DEV
  : import.meta.env.VITE_ENABLE_GROOM_WEB === 'true';
