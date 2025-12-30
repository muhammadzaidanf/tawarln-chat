import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  serverExternalPackages: [
    "pdf-parse", 
    "sharp", 
    "onnxruntime-node", 
    "langchain",
    "@langchain/openai",
    "@langchain/core",
    "@langchain/textsplitters" 
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