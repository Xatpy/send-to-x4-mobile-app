#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_OKHTTP="${1:-}"
EXPECTED_SDK="${EXPECTED_SDK:-36}"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

pass() {
  echo "[OK] $1"
}

check_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if rg -q "$pattern" "$file"; then
    pass "$description"
  else
    fail "$description (missing in $file)"
  fi
}

check_contains "$ROOT_DIR/android/gradle.properties" '^hermesEnabled=true$' 'Hermes enabled in gradle.properties'
check_contains "$ROOT_DIR/android/build.gradle" "compileSdkVersion\\s*=\\s*${EXPECTED_SDK}" "compileSdkVersion pinned to ${EXPECTED_SDK}"
check_contains "$ROOT_DIR/android/build.gradle" "targetSdkVersion\\s*=\\s*${EXPECTED_SDK}" "targetSdkVersion pinned to ${EXPECTED_SDK}"
check_contains "$ROOT_DIR/android/app/src/main/AndroidManifest.xml" 'android:usesCleartextTraffic="true"' 'usesCleartextTraffic=true in AndroidManifest.xml'
check_contains "$ROOT_DIR/android/app/src/main/AndroidManifest.xml" 'android:networkSecurityConfig="@xml/network_security_config"' 'networkSecurityConfig set in AndroidManifest.xml'
check_contains "$ROOT_DIR/android/app/src/main/res/xml/network_security_config.xml" 'cleartextTrafficPermitted="true"' 'cleartext permitted in network security config'
check_contains "$ROOT_DIR/app.json" '"jsEngine"\s*:\s*"hermes"' 'Hermes explicit in app.json'
check_contains "$ROOT_DIR/app.json" "\"compileSdkVersion\"\\s*:\\s*${EXPECTED_SDK}" "compileSdkVersion pinned in app.json plugin config (${EXPECTED_SDK})"
check_contains "$ROOT_DIR/app.json" "\"targetSdkVersion\"\\s*:\\s*${EXPECTED_SDK}" "targetSdkVersion pinned in app.json plugin config (${EXPECTED_SDK})"

if [ "$CHECK_OKHTTP" = "--check-okhttp" ]; then
  echo
  pushd "$ROOT_DIR/android" >/dev/null
  OKHTTP_OUT="$(./gradlew :app:dependencyInsight --dependency okhttp --configuration releaseRuntimeClasspath 2>/dev/null || true)"
  popd >/dev/null

  if printf '%s\n' "$OKHTTP_OUT" | rg -q 'com\.squareup\.okhttp3:okhttp:4\.12\.0'; then
    pass 'OkHttp resolves to 4.12.0 in releaseRuntimeClasspath'
  else
    fail 'OkHttp 4.12.0 override not found in releaseRuntimeClasspath'
  fi
else
  echo "[INFO] Skipping Gradle dependency check. Run with --check-okhttp to verify resolved OkHttp version."
fi

echo
echo "Native config baseline checks passed."
