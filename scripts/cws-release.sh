#!/usr/bin/env bash
set -euo pipefail

: "${CWS_ACCESS_TOKEN:?CWS_ACCESS_TOKEN is required}"
: "${CWS_PUBLISHER_ID:?CWS_PUBLISHER_ID is required}"
: "${CWS_EXTENSION_ID:?CWS_EXTENSION_ID is required}"

PACKAGE_FILE="${1:-dist/speed-up-chatgpt.zip}"
PUBLISH_TYPE="${CWS_PUBLISH_TYPE:-UPLOAD_ONLY}"
SKIP_REVIEW="${CWS_SKIP_REVIEW:-false}"

case "${PUBLISH_TYPE}" in
  UPLOAD_ONLY|DEFAULT_PUBLISH|STAGED_PUBLISH)
    ;;
  *)
    echo "Unsupported CWS_PUBLISH_TYPE: ${PUBLISH_TYPE}" >&2
    exit 2
    ;;
esac

case "${SKIP_REVIEW}" in
  true|false)
    ;;
  *)
    echo "CWS_SKIP_REVIEW must be true or false: ${SKIP_REVIEW}" >&2
    exit 2
    ;;
esac

if [[ ! -f "$PACKAGE_FILE" ]]; then
  echo "Package file not found: $PACKAGE_FILE" >&2
  exit 1
fi

item_name="publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}"
auth_header="Authorization: Bearer ${CWS_ACCESS_TOKEN}"
upload_url="https://chromewebstore.googleapis.com/upload/v2/${item_name}:upload"
status_url="https://chromewebstore.googleapis.com/v2/${item_name}:fetchStatus"
publish_url="https://chromewebstore.googleapis.com/v2/${item_name}:publish"

json_read() {
  node -e '
const fs = require("node:fs");
const path = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8"));
let current = data;
for (const segment of path.split(".")) current = current?.[segment];
if (current === undefined || current === null) process.exit(1);
process.stdout.write(String(current));
' "$1"
}

api_call() {
  local method="$1" url="$2"
  shift 2
  local response_file http_code
  response_file="$(mktemp)"
  http_code="$(curl --silent --show-error -o "$response_file" -w '%{http_code}' -H "$auth_header" -X "$method" "$@" "$url" || true)"
  if [[ ! "$http_code" =~ ^2 ]]; then
    echo "Chrome Web Store API request failed (${method} ${url}) with HTTP ${http_code}." >&2
    cat "$response_file" >&2 || true
    rm -f "$response_file"
    return 1
  fi
  cat "$response_file"
  rm -f "$response_file"
}

echo "Uploading ${PACKAGE_FILE} to ${item_name}"
upload_response="$(api_call POST "$upload_url" -T "$PACKAGE_FILE")"
printf '%s\n' "$upload_response"
upload_state="$(printf '%s' "$upload_response" | json_read 'uploadState' || true)"

if [[ "$upload_state" == "IN_PROGRESS" ]]; then
  echo "Upload is processing asynchronously. Polling status..."
  for attempt in $(seq 1 30); do
    sleep 2
    status_response="$(api_call GET "$status_url")"
    printf '%s\n' "$status_response"
    upload_state="$(printf '%s' "$status_response" | json_read 'lastAsyncUploadState' || true)"
    [[ "$upload_state" == "SUCCEEDED" ]] && break
    if [[ "$upload_state" == "FAILED" ]]; then
      echo "Upload failed while processing asynchronously." >&2
      exit 1
    fi
  done
fi

if [[ "$upload_state" != "SUCCEEDED" ]]; then
  echo "Unexpected upload state: ${upload_state:-<empty>}" >&2
  exit 1
fi

echo "Upload finished successfully."
if [[ "$PUBLISH_TYPE" == "UPLOAD_ONLY" ]]; then
  echo "Skipping publish step."
  exit 0
fi

request_body="$(node -e '
const publishType = process.argv[1];
const skipReview = process.argv[2] === "true";
process.stdout.write(JSON.stringify({ publishType, skipReview }));
' "$PUBLISH_TYPE" "$SKIP_REVIEW")"

echo "Submitting item with publishType=${PUBLISH_TYPE} skipReview=${SKIP_REVIEW}"
publish_response="$(api_call POST "$publish_url" -H 'Content-Type: application/json' -d "$request_body")"
printf '%s\n' "$publish_response"
publish_state="$(printf '%s' "$publish_response" | json_read 'state' || true)"
if [[ -z "$publish_state" ]]; then
  echo "Publish response did not contain a state." >&2
  exit 1
fi
echo "Submission state: ${publish_state}"
