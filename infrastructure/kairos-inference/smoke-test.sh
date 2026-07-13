#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${KAIROS_INFERENCE_URL:?Set KAIROS_INFERENCE_URL}"
TOKEN="${KAIROS_INFERENCE_TOKEN:?Set KAIROS_INFERENCE_TOKEN}"
MODEL="${KAIROS_MODEL:-Qwen3.6-35B-A3B}"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL%/}/v1/models" >/tmp/kairos-models.json

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${MODEL}\",\"temperature\":0,\"max_tokens\":64,\"messages\":[{\"role\":\"system\",\"content\":\"Return only JSON.\"},{\"role\":\"user\",\"content\":\"Return {\\\"status\\\":\\\"ready\\\"}.\"}]}" \
  "${BASE_URL%/}/v1/chat/completions" >/tmp/kairos-completion.json

python3 - <<'PY'
import json
from pathlib import Path
models=json.loads(Path('/tmp/kairos-models.json').read_text())
completion=json.loads(Path('/tmp/kairos-completion.json').read_text())
assert models.get('data'), 'No model returned by inference server'
text=completion['choices'][0]['message']['content']
assert text.strip(), 'Empty completion returned'
print('Kairos private inference smoke test passed.')
print(text)
PY
