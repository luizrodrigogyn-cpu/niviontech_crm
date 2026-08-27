import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware(async (auth, request) => {
  // A landing page permanece pública. Todo o pacote do CRM (HTML, JavaScript,
  // CSS e módulos) exige uma sessão Clerk válida, inclusive em acesso direto.
  if (request.nextUrl.pathname === '/crm' || request.nextUrl.pathname.startsWith('/crm/')) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/', '/crm/:path*', '/api/:path*'],
};
