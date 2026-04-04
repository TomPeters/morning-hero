import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import '@/lib/db'; // triggers initDb() side effect on startup

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Morning Hero',
  description: 'Complete your morning jobs!',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-amber-50 font-[family-name:var(--font-geist-sans)]">
        {children}
      </body>
    </html>
  );
}
