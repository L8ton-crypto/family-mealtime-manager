import type { MetadataRoute } from 'next';

// Next's metadata-route convention: served at /manifest.webmanifest (Next
// 16 appends the extension itself). src/proxy.ts's PUBLIC_EXACT_PATHS
// already allow-lists that exact path so it's reachable unauthenticated,
// which real installability checks (Chrome's Application panel, Android's
// add-to-home-screen prompt) require. See docs/slices/05-service.md's PWA
// scope and docs/VISION.md for the colour tokens (reproduced here as
// literal hex — a manifest can't read CSS variables).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Rice Kitchen',
    short_name: 'Rice Kitchen',
    description: 'The Rice family kitchen pass — private meal planning for one household.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0C0C0D',
    theme_color: '#0C0C0D',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
