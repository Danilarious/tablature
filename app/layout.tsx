import type { Metadata } from 'next';
import './globals.css';
import Navigation from './components/Navigation';

export const metadata: Metadata = {
  title: 'BxB Music Notebook — Local-First Instrumental Archive',
  description: 'Personal music notebook for alternate tunings, extended-range guitars, partial capos, motifs, compositions, and string tension physics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-paper-50 text-stone-900 antialiased selection:bg-stone-900 selection:text-white">
        <Navigation />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
