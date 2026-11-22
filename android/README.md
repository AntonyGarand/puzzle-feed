# Android app (Trusted Web Activity)

A thin wrapper that opens https://puzzle.garand.dev full-screen in Chrome. The game itself still ships
through GitHub Pages: pushes to `main` reach app users without a store release. Package ID
`dev.garand.puzzle`.

Generated with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) from `twa-manifest.json`.
Don't hand-edit the generated files: change `twa-manifest.json`, then regenerate:

```sh
npx @bubblewrap/cli update --skipVersionUpgrade   # bump appVersionCode/appVersion in the manifest for a release
```

## Build

Needs JDK 17 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`). The upload key is
`~/.secrets/puzzle-feed-upload.jks` (alias `upload`) and its password is in
`~/.secrets/PUZZLE_FEED_ANDROID_KEYSTORE_PASSWORD`. Never commit either.

```sh
android/build.sh   # -> android/dist/puzzle-feed.aab (Play) + puzzle-feed.apk (sideload)
```

## Digital Asset Links

Chrome only hides the URL bar if `/.well-known/assetlinks.json` (in `public/`) lists the SHA-256 of the
certificate that signed the installed app:

- The **upload key** fingerprint is there, so sideloaded `puzzle-feed.apk` builds verify.
- After the first Play upload, copy the **app signing key** SHA-256 from Play Console → Test and
  release → App integrity, and add it to the same array. Play-installed copies are signed with
  Google's key, not the upload key.

Check: install the APK and open it. If a URL bar shows at the top, verification failed. Usually the
fingerprint is missing, or the live site doesn't serve `assetlinks.json` yet. Google's checker:
https://developers.google.com/digital-asset-links/tools/generator
