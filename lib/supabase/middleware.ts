import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase yapılandırılmamışsa session yenilemeyi atla
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Session yenileme
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Onboarding tamamlamış kullanıcıyı /chat'e yönlendir
  // (şimdilik ana sayfaya bırakıyoruz)
  if (user && request.nextUrl.pathname === '/') {
    // kullanıcı giriş yapmış, onboarding durumuna bakabiliriz
    // ama middleware'de DB sorgusu yapmak yerine client-side kontrol edeceğiz
  }

  return supabaseResponse;
}
