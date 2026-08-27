import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata = {
  title: 'NivionTech CRM',
  description: 'CRM inteligente para pequenas empresas, com o assistente comercial Orbit.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ClerkProvider dynamic><html lang="pt-BR"><body>{children}</body></html></ClerkProvider>;
}
