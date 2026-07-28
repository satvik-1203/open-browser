import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  // `@repo/types` is a private workspace package, so a published `dist/index.d.ts`
  // that imports from it resolves to nothing for consumers — silently tolerated
  // under `skipLibCheck`, a hard error without it. `resolve` inlines those
  // declarations into the bundle instead of leaving the import behind.
  dts: { resolve: ["@repo/types"] },
  clean: true,
});
