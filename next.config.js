/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uojuzhyyaldqhurryxyc.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/listing-photos/**",
      },
    ],
  },
};

module.exports = nextConfig;