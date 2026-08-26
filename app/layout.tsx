import './globals.css';

export const metadata = {
  title: 'NivionTech CRM',
  description: 'CRM inteligente para pequenas empresas, com o assistente comercial Orbit.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
