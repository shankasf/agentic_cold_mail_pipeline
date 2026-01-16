/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'pdf-parse'],
  },
};

export default nextConfig;
