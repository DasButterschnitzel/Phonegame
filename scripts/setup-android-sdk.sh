#!/usr/bin/env bash
# Installs a minimal Android SDK for `./gradlew assembleDebug` (Linux). Usage: scripts/setup-android-sdk.sh [/opt/android-sdk]
set -euo pipefail
SDK="${1:-${ANDROID_HOME:-/opt/android-sdk}}"
TOOLS_ZIP="commandlinetools-linux-15859902_latest.zip"
mkdir -p "$SDK/cmdline-tools"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/tools.zip" "https://dl.google.com/android/repository/$TOOLS_ZIP"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
export ANDROID_HOME="$SDK"
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses > /dev/null || true
"$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "build-tools;35.0.0"
# Point Gradle at the SDK (gitignored).
here="$(cd "$(dirname "$0")/.." && pwd)"
if [ -d "$here/android" ]; then echo "sdk.dir=$SDK" > "$here/android/local.properties"; fi
echo "Android SDK ready at $SDK"
