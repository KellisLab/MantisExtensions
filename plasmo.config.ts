export default {
  manifest: {
    permissions: [
      "storage",
      "cookies",
      "webRequest"
    ],
    host_permissions: [
      "https://api.github.com/*",
      "https://github.com/*"
    ]
  }
}