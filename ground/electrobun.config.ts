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
      "src/mainview/fonts/jetbrains-mono.woff2": "views/mainview/fonts/jetbrains-mono.woff2"
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
