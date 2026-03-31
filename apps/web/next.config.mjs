import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

function resolveDevDistDir() {
  const rawInstance = process.env.NEXT_DEV_INSTANCE ?? 'web';
  const safeInstance = rawInstance.replace(/[^a-zA-Z0-9_-]/g, '');
  return `.next-dev-${safeInstance || 'web'}`;
}

/** @type {import('next').NextConfig} */
export default function nextConfig(phase) {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    output: 'standalone',
    // Prevent concurrent `next dev` processes (web + e2e) from corrupting each other's assets.
    distDir: isDevServer ? resolveDevDistDir() : '.next'
  };
}
