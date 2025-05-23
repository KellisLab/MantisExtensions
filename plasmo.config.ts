import { defineConfig } from "@plasmohq/config";
export default defineConfig({
  name: "Mantis connection", 
  version: "0.0.1", 
  manifest: {
    permissions: [
      "storage",
      "cookies",
      "identity"
    ],
    oauth2: {
      "client_id": "643972847997-pc3e8k15pth0um15t1lu3lq5i8sume66.apps.googleusercontent.com",
      "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
    },
  }
});