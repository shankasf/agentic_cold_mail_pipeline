/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'pdf-parse'],
  },
};

export default nextConfig;
