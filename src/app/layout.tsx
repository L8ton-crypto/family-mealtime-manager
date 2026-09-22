import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bebas-neue',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  // Ticket data (times, seat numbers, mono headers) is never the first
  // thing painted, so preloading this font's file on every page just to
  // have it possibly go unused within Chrome's few-second window produced
  // a console warning. It still loads (and swaps in) once actually used.
  preload: false,
});

export const metadata: Metadata = {
  title: 'The Rice Kitchen',
  description: 'The Rice family kitchen pass — private meal planning for one household.',
  robots: { index: false, follow: false },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  // Renders apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-
  // style and apple-mobile-web-app-title — iOS Safari's own (pre-manifest)
  // signal that "Add to Home Screen" should launch full-screen with no
  // Safari chrome. See docs/slices/05-service.md's PWA scope.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Rice Kitchen',
  },
};

// Separate from `metadata` per Next's own split (themeColor/viewport moved
// out of the Metadata type). viewportFit: 'cover' plus the bottom tab bar's
// own env(safe-area-inset-bottom) padding (AppShell.tsx) is what lets the
// bottom bar sit clear of the home-indicator area on notched iPhones once
// installed standalone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0C0C0D',
};

// Applied before first paint so there is no flash of the wrong theme.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('rk-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // No data-theme prop here on purpose: React must never render this
      // attribute itself. The inline script below sets it directly on the
      // DOM before hydration (reading localStorage, falling back to dark),
      // which would otherwise legitimately differ from whatever React
      // thinks the server rendered and trip a hydration-mismatch warning
      // even with suppressHydrationWarning. Leaving the attribute out of
      // React's own render means React has no expectation for it at all.
      // globals.css's bare `:root` selector (no [data-theme] needed) is the
      // dark palette, so the absence of the attribute pre-hydration still
      // renders dark — no flash.
      suppressHydrationWarning
      className={`${bebasNeue.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
