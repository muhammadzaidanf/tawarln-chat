import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Inisialisasi Response Awal
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 2. Setup Supabase Client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // --- FIX DISINI ---
          // Loop 1: Update Request (Cuma butuh name & value, 'options' dihapus biar gak error)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          
          // Loop 2: Update Response (Di sini 'options' DIPAKAI, jadi biarkan ada)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. Refresh Session User (Wajib buat Auth Supabase)
  const { data: { user } } = await supabase.auth.getUser()

  // ============================================================
  // 🛡️ SECURITY GATE (SATPAM)
  // Cek apakah user mencoba masuk ke area "/admin"
  // ============================================================
  if (request.nextUrl.pathname.startsWith('/admin')) {
    
    // A. Cek Login: Kalau belum login, tendang ke Home
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // B. Cek Role: Ambil data role user dari tabel 'profiles'
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // C. Validasi Role: Kalau bukan 'admin' atau 'owner', tendang ke Home
    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    // Middleware jalan di semua route KECUALI file statis & gambar
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}