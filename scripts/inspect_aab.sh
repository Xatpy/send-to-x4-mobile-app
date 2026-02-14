#!/usr/bin/env bash
set -euo pipefail
EXPECTED_SDK="${EXPECTED_SDK:-36}"

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-aab>" >&2
  exit 1
fi

AAB="$1"
if [ ! -f "$AAB" ]; then
  echo "AAB not found: $AAB" >&2
  exit 1
fi

run_bundletool() {
  local default_jar
  default_jar="$(cd "$(dirname "$0")/.." && pwd)/tools/bundletool.jar"

  if [ -f "$default_jar" ]; then
    java -jar "$default_jar" "$@"
    return
  fi

  if [ -n "${BUNDLETOOL_JAR:-}" ] && [ -f "$BUNDLETOOL_JAR" ]; then
    java -jar "$BUNDLETOOL_JAR" "$@"
    return
  fi

  if command -v bundletool >/dev/null 2>&1; then
    bundletool "$@"
    return
  fi

  echo "bundletool not found. Set BUNDLETOOL_JAR=/path/to/bundletool.jar or install bundletool in PATH." >&2
  exit 1
}

TMP_DIR="$(mktemp -d)"
MANIFEST_TXT="$TMP_DIR/base-manifest.xml"
LISTING_TXT="$TMP_DIR/aab-listing.txt"
trap 'rm -rf "$TMP_DIR"' EXIT

run_bundletool dump manifest --bundle="$AAB" --module=base > "$MANIFEST_TXT"
unzip -l "$AAB" > "$LISTING_TXT"

print_field() {
  local key="$1"
  local fallback="$2"
  local line
  line="$(rg -o "${key}=\"[^\"]+\"" "$MANIFEST_TXT" | head -n1 || true)"
  if [ -n "$line" ]; then
    echo "$line"
  else
    echo "$fallback"
  fi
}

TARGET_SDK="$(print_field 'targetSdkVersion' 'targetSdkVersion=<not found>')"
MIN_SDK="$(print_field 'minSdkVersion' 'minSdkVersion=<not found>')"
CLEAR="$(print_field 'usesCleartextTraffic' 'usesCleartextTraffic=<not found>')"
NETCFG="$(print_field 'networkSecurityConfig' 'networkSecurityConfig=<not found>')"

HAS_HERMES="no"
HAS_JSC="no"
if rg -q 'lib/.*/libhermes\.so' "$LISTING_TXT"; then HAS_HERMES="yes"; fi
if rg -q 'lib/.*/libjsc\.so|lib/.*/libjscexecutor\.so' "$LISTING_TXT"; then HAS_JSC="yes"; fi

echo "AAB: $AAB"
echo "$MIN_SDK"
echo "$TARGET_SDK"
echo "$CLEAR"
echo "$NETCFG"
echo "hermesNativeLibs=$HAS_HERMES"
echo "jscNativeLibs=$HAS_JSC"

FAIL=0
if ! rg -q "targetSdkVersion=\"${EXPECTED_SDK}\"" "$MANIFEST_TXT"; then
  echo "[FAIL] targetSdkVersion is not ${EXPECTED_SDK}" >&2
  FAIL=1
fi
if ! rg -q 'usesCleartextTraffic="true"' "$MANIFEST_TXT"; then
  echo "[FAIL] usesCleartextTraffic is not true in base manifest" >&2
  FAIL=1
fi
if ! rg -q 'networkSecurityConfig="@xml/network_security_config"' "$MANIFEST_TXT"; then
  echo "[FAIL] networkSecurityConfig is missing in base manifest" >&2
  FAIL=1
fi
if [ "$HAS_HERMES" != "yes" ]; then
  echo "[FAIL] Hermes native libs not found" >&2
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi

echo "[OK] AAB passes baseline checks"
