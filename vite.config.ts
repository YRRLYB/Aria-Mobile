import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import postcss from "postcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function legacyCascadeLayerFallback() {
  return {
    name: "legacy-cascade-layer-fallback",
    apply: "build" as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css") || asset.source == null) continue;
        const source = typeof asset.source === "string"
          ? asset.source
          : new TextDecoder().decode(asset.source);
        const layered = postcss.parse(source);
        const unlayered = layered.clone();
        unlayered.walkAtRules("layer", (layer) => {
          layer.replaceWith(...(layer.nodes ?? []).map((node) => node.clone()));
        });
        asset.source = `${source}\n/* Legacy Android WebView fallback: cascade layers are unsupported. */\n${unlayered.toString()}`;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), legacyCascadeLayerFallback()],
  resolve: {
    alias: {
      "@": path.resolve(here, "core"),
    },
  },
  server: {
    port: 5183,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2400,
  },
});
