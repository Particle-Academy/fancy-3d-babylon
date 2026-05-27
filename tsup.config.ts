import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx", "src/engine.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@babylonjs/core",
    "@particle-academy/fancy-3d",
    "@particle-academy/react-fancy",
  ],
  treeshake: true,
});
