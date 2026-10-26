Drop build archives here.

  coast-road-demo-win64.zip   <- expected by src/site.config.js (demo.downloads)

After adding a file:
  1. set `uploaded: true` on the matching entry in src/site.config.js
  2. paste the checksum:  sha256sum <file>
  3. fill in the real size

Large archives should not be committed to Git - host them on GitHub Releases and
put the full release URL in `file` instead.
