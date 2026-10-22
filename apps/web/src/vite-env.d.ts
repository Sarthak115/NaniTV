/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Origin the TV's QR code points phones to. Defaults to the TV page's own origin. */
  readonly VITE_FAMILY_URL?: string;
}
