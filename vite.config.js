export default {
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
    hmr: {
      clientPort: 443
    },
    headers: {
      'X-Frame-Options': 'ALLOWALL'
    },
    // allow all hosts for Arena preview
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  }
}
