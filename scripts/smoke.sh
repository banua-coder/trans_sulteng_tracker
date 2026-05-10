#!/usr/bin/env bash
#
# Smoke check for a running cektrans-proxy.
# Hits health + the three public REST endpoints and prints a one-line
# verdict per check. Fails fast on any non-200 / unexpected payload.
#
# Usage:
#   scripts/smoke.sh                       # probes http://localhost:8080
#   PROXY_BASE=https://cektrans.banuacoder.com scripts/smoke.sh
#
# Optional flags:
#   --origin <url>   Origin header to send (default: $PROXY_BASE)
#   --pref <id>      Pref to probe corridors/halte for (default: 12 = Palu)
#
# Exit codes: 0 on success; 1 on any failure.

set -euo pipefail

PROXY_BASE="${PROXY_BASE:-http://localhost:8080}"
# Origin must match the proxy's ALLOW_ORIGIN. Default to the dev value;
# pass --origin or set ORIGIN=… in CI for production checks.
ORIGIN="${ORIGIN:-${ALLOW_ORIGIN:-http://localhost:5173}}"
PREF="12"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) ORIGIN="$2"; shift 2 ;;
    --pref) PREF="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
done

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

probe() {
  local label="$1" path="$2" expect="${3:-}"
  local url="${PROXY_BASE}${path}"
  local body status
  body=$(curl -fsS -H "Origin: ${ORIGIN}" -H "Accept: application/json" \
              -o /tmp/cektrans-smoke.body -w '%{http_code}' \
              "$url") || fail "${label} :: curl failed (${url})"
  status="$body"
  [[ "$status" == "200" ]] || fail "${label} :: status ${status}"
  if [[ -n "$expect" ]]; then
    grep -qE "$expect" /tmp/cektrans-smoke.body \
      || fail "${label} :: payload didn't match /${expect}/"
  fi
  ok "${label} (${status}, $(wc -c </tmp/cektrans-smoke.body | tr -d ' ') bytes)"
}

echo "── cektrans smoke check ──"
echo "  base    : ${PROXY_BASE}"
echo "  origin  : ${ORIGIN}"
echo "  pref    : ${PREF}"
echo

probe "health"            "/api/health"                         '"status":"ok"'
probe "cities"            "/api/cities"                         '\['
probe "corridors:${PREF}" "/api/cities/${PREF}/corridors"       '\['
probe "halte:${PREF}"     "/api/cities/${PREF}/halte"           '\['

# Origin gate sanity: a request without a matching Origin should be 403.
ngorigin_status=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Origin: https://example.invalid" \
  "${PROXY_BASE}/api/cities") || ngorigin_status=000
if [[ "$ngorigin_status" == "403" ]]; then
  ok "origin gate rejects bad origin (403)"
else
  fail "origin gate :: expected 403, got ${ngorigin_status}"
fi

echo
echo "All checks passed."
