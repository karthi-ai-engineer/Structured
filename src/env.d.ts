// Typed Vite environment for the browser bundle (docs/phases/phase-0/PLAN.md 6.3).
// Every value is optional: an unconfigured build (CI, or a clone without .env.local) must still
// compile and render "Database not configured" instead of a white screen.

// Strict mode: reading an undeclared import.meta.env key is a type error.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Public git SHA stamped by the deploy (also written to <meta name="build-sha">). */
  readonly VITE_BUILD_SHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
