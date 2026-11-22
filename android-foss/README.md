# Android app, bundled build (F-Droid / GitHub releases)

A [Capacitor](https://capacitorjs.com) app that ships `dist/` inside the APK, so it works offline and
needs no particular browser. Package ID `dev.garand.puzzle.foss`, about 1.5 MB. The Play Store app is
the TWA in `../android/` instead.

The WebView serves the bundled files as `https://puzzle.garand.dev` (`capacitor.config.json`), so
storage and analytics behave like the website. Analytics events carry `app.platform = android`,
and players can turn them off in Settings. The service worker and source maps are left out
(`vite build --mode android`).

## Updates

- **Game (web) changes update themselves.** Every deploy to Pages also publishes the same commit built in
  android mode as `https://puzzle.garand.dev/android/bundle-<sha>.zip`, along with `version.json`
  (`{sha, url, checksum}`). On launch, on resume, and every 30 minutes, the app (`src/core/update.ts`)
  compares that sha with its own. If they differ, it downloads the zip with
  [@capgo/capacitor-updater](https://github.com/Cap-go/capacitor-updater) and switches to it the next
  time the app goes to the background. It also shows the same "New version" banner as the site.
  Capgo's cloud is not used: update, channel and stats URLs are all off in `capacitor.config.json`.
  If a downloaded build doesn't start, the updater rolls back to the previous one.
- **Native changes** (Capacitor, plugins, Android config, icons) need a new APK: tag a release.
  Installing a new APK drops the downloaded bundles (`resetWhenUpdate`), so it starts from its own files.
  If a web change ever needs a newer native plugin, release the APK first.

## Release

Push a `vX.Y.Z` tag on `main`. `.github/workflows/android-release.yml` builds and signs the APK
(versionCode `X*10000 + Y*100 + Z`) and attaches it to a GitHub release. The F-Droid repo
(https://fdroid.garand.dev, repo AntonyGarand/fdroid) picks it up on its next run.

## Local build

Needs JDK 21+ (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`).

```sh
npm run build:android                 # vite build --mode android && cap sync android
cd android-foss && ./gradlew assembleRelease -PversionCode=1 -PversionName=0.0.1
```

To sign, set `ANDROID_KEYSTORE` (path) and `ANDROID_KEYSTORE_PASSWORD`. Without them the APK is
unsigned. The release key is `~/.secrets/puzzle-feed-foss-release.jks` (alias `release`), with its
password in `~/.secrets/PUZZLE_FEED_FOSS_KEYSTORE_PASSWORD`. CI has both as the secrets
`ANDROID_FOSS_KEYSTORE_B64` and `ANDROID_FOSS_KEYSTORE_PASSWORD`. **Losing this key means users
can't update**: every installed copy is tied to it.

The icons and splash in `app/src/main/res` are copied from the TWA's generated assets.
