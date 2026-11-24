import './globals.css';
import { Bricolage_Grotesque } from 'next/font/google';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata = {
  title: 'FiberVault — Pay-to-Unlock on CKB Testnet',
  description: 'Atomic pay-to-unlock encrypted data powered by Fiber Network payment channels on CKB.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body>{children}</body>
    </html>
  );
}
