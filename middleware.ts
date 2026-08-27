import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // annotated explicitly — see the note in lib/supabase-server.ts
  const cookieMethods: CookieMethodsServer = {
    getAll: () => request.cookies.getAll(),
    setAll: (list) => {
      list.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

// every match costs one getUser() round trip, so static assets are skipped
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|webp|ico|webmanifest)$).*)",
  ],
};
