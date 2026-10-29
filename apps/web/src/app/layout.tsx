import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { ToastProvider } from '@/components/ui/toast';
import { getSiteInfo } from '@/lib/site';
import { fontDisplay, fontSans } from './fonts';
import './globals.css';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteInfo();
  return {
    title: { default: site.name, template: `%s | ${site.short}` },
    description: site.subtitle || site.name,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
