import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A sibling package-lock.json outside this repo (in the parent clawd/
  // workspace, unrelated to this project) otherwise makes Next guess the
  // wrong workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
