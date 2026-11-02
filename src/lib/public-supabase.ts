// Public Supabase connection for the production site.
// Both values are designed to be public: they ship in the browser bundle, and
// Row Level Security decides what they can read or write. Environment variables
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) override these when set.
// NEVER put the service-role key here.
export const PUBLIC_SUPABASE_URL = "https://jfjntuvntqjnefzcsojb.supabase.co";
export const PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_7UoN677WRPFfm9uDe4oR9w_w46bjIKB";
