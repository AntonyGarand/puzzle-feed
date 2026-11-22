#!/usr/bin/env bash
# Builds the signed Play bundle (.aab) and a sideloadable .apk for the TWA wrapper.
#
#   ANDROID_KEYSTORE           upload keystore   (default ~/.secrets/puzzle-feed-upload.jks)
#   ANDROID_KEYSTORE_PASSWORD  store + key pass  (default contents of ~/.secrets/PUZZLE_FEED_ANDROID_KEYSTORE_PASSWORD)
#   ANDROID_HOME / JAVA_HOME   Android SDK and a JDK 17
#
# Outputs land in android/dist/.
set -euo pipefail
cd "$(dirname "$0")"

KS="${ANDROID_KEYSTORE:-$HOME/.secrets/puzzle-feed-upload.jks}"
export ANDROID_KEYSTORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-$(cat "$HOME/.secrets/PUZZLE_FEED_ANDROID_KEYSTORE_PASSWORD")}"
: "${ANDROID_HOME:?set ANDROID_HOME to the Android SDK}"

BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
ext=""; [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && ext=".bat"

./gradlew --no-daemon -q bundleRelease assembleRelease

rm -rf dist && mkdir dist
"$BT/zipalign$( [[ -n $ext ]] && echo .exe )" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk dist/aligned.apk
"$BT/apksigner$ext" sign --ks "$KS" --ks-key-alias upload \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD \
  --out dist/puzzle-feed.apk dist/aligned.apk
rm dist/aligned.apk dist/*.idsig 2>/dev/null || true

cp app/build/outputs/bundle/release/app-release.aab dist/puzzle-feed.aab
jarsigner -keystore "$KS" -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEYSTORE_PASSWORD \
  dist/puzzle-feed.aab upload >/dev/null

"$BT/apksigner$ext" verify dist/puzzle-feed.apk
ls -l dist
