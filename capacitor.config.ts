import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yrrlyb.aria.mobile",
  appName: "Aria",
  webDir: "dist",
  android: {
    allowMixedContent: true,
    // Reserve space for the status bar / display cutout on every Android
    // version: without this the WebView draws under the system clock and
    // battery indicator on edge-to-edge devices.
    adjustMarginsForEdgeToEdge: "force",
  },
  server: {
    // The whole data source is a plain-http LAN desktop. Loading the app from
    // an https origin (the default) would mark every cover/API request as
    // mixed content and the WebView blocks or degrades it on real devices —
    // that is why artwork showed as broken-image glyphs. Staying on http
    // removes mixed content entirely; the pairing token protects the LAN.
    androidScheme: "http",
    cleartext: true,
  },
};

export default config;
