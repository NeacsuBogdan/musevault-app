import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'MuseVault',
  description: 'A creative vault for music ideas, assets, metadata, and workflows.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
