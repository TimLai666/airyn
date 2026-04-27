import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Airyn Ground",
    identifier: "dev.airyn.ground",
    version: "0.1.0",
    description: "Ground control, mission planning, and telemetry monitoring for Airyn aircraft."
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts"
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts"
      }
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
      "src/mainview/fonts/inter.woff2": "views/mainview/fonts/inter.woff2",
      "src/mainview/fonts/inter-tight.woff2": "views/mainview/fonts/inter-tight.woff2",
      "src/mainview/fonts/jetbrains-mono.woff2": "views/mainview/fonts/jetbrains-mono.woff2",
      "src/mainview/vendor/leaflet/leaflet.css": "views/mainview/vendor/leaflet/leaflet.css",
      "src/mainview/vendor/leaflet/leaflet.js": "views/mainview/vendor/leaflet/leaflet.js",
      "src/mainview/vendor/leaflet/images/marker-icon.png": "views/mainview/vendor/leaflet/images/marker-icon.png",
      "src/mainview/vendor/leaflet/images/marker-icon-2x.png": "views/mainview/vendor/leaflet/images/marker-icon-2x.png",
      "src/mainview/vendor/leaflet/images/marker-shadow.png": "views/mainview/vendor/leaflet/images/marker-shadow.png",
      "src/mainview/vendor/leaflet/images/layers.png": "views/mainview/vendor/leaflet/images/layers.png",
      "src/mainview/vendor/leaflet/images/layers-2x.png": "views/mainview/vendor/leaflet/images/layers-2x.png"
    },
    mac: {
      bundleCEF: false
    },
    linux: {
      bundleCEF: false
    },
    win: {
      bundleCEF: false
    }
  },
  runtime: {
    exitOnLastWindowClosed: true
  }
} satisfies ElectrobunConfig;
