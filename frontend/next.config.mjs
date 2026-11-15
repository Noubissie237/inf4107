/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `npm run build` writes out/, deployable as is on any static hosting
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
