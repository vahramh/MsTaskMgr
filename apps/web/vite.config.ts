import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      manifest: {
        name: "Execution Guidance System",
        short_name: "EGS",
        description: "Professional execution guidance and task decision support.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#111827",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },

      workbox: {
        navigateFallback: "/index.html",

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/qr23jztg53\.execute-api\.ap-southeast-2\.amazonaws\.com\/.*/i,
            handler: "NetworkOnly",
            method: "GET"
          }
        ]
      }
    })
  ]
});