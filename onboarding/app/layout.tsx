import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Synta Academy — VIP Session Gratuite',
  description: 'Inscris-toi à la session gratuite et exclusive de Synta Academy. Places limitées pour les élèves de 2ème, 3ème et Bac.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
