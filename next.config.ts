import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // 👇 Update bagian ini. Tambahin @langchain/openai dll
  serverExternalPackages: [
    "pdf-parse", 
    "sharp", 
    "onnxruntime-node", 
    "langchain",
    "@langchain/openai",
    "@langchain/core"
  ],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;