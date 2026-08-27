import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseServer() {
  const store = cookies();

  // annotated explicitly: `cookies` is a union of the current and the deprecated
  // shape, so TypeScript cannot infer the setAll parameter on its own
  const cookieMethods: CookieMethodsServer = {
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        list.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // called from a server component — middleware refreshes the session instead
      }
    },
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  );
}
