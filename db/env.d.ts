declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TAVILY_API_KEY?: string;
    PROSPECT_MONTHLY_QUERY_CAP?: string;
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
