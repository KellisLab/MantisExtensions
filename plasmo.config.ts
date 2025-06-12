import { defineConfig } from "@plasmohq/config"

export default defineConfig({
  name: "Mantis connection",
  version: "0.0.1",
  manifest: {
    permissions: ["storage", "cookies", "identity"],
  }
})