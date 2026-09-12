import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yrrlyb.aria.mobile",
  appName: "Aria",
  webDir: "dist",
  android: {
    allowMixedContent: true,
    // True immersive layout: the web layer paints behind the system bars and
    // MainActivity injects the safe-area sizes as --aria-safe-top/-bottom CSS
    // variables (hard margins would leave a flat white strip under the
    // status bar that clashes with the gradient pages).
    adjustMarginsForEdgeToEdge: "disable",
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
