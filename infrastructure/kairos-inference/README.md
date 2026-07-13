# Kairos Private Inference Engine

This package deploys the MMG-owned text-generation runtime. It does not use OpenAI or any hosted model API.

## Runtime

- Model: `Qwen/Qwen3.6-35B-A3B`
- Server: vLLM
- Protocol: authenticated `/v1/chat/completions`
- Local listener: `127.0.0.1:8000`
- Public access: private HTTPS hostname routed through Cloudflare Tunnel or an equivalent MMG-controlled reverse proxy

## GPU host requirements

1. Linux host with NVIDIA driver and NVIDIA Container Toolkit.
2. Docker Engine with Compose.
3. Sufficient GPU memory for the selected model and context length. Increase `KAIROS_TENSOR_PARALLEL_SIZE` when distributing the model across multiple GPUs.
4. Persistent disk space for the model cache.

## Start

```bash
cd infrastructure/kairos-inference
cp .env.example .env
# Replace KAIROS_INFERENCE_TOKEN with a long random secret.
docker compose pull
docker compose up -d
```

The model download and first initialization can take several minutes. Inspect progress with:

```bash
docker compose logs -f vllm
```

## Private HTTPS route

Expose only the local service through an MMG-controlled Cloudflare Tunnel or reverse proxy:

```text
https://<private-inference-hostname>  ->  http://127.0.0.1:8000
```

Do not open port 8000 directly to the public internet. The vLLM API key must remain enabled.

## Worker configuration

Set these Cloudflare Worker values:

```text
KAIROS_INFERENCE_URL=https://<private-inference-hostname>
KAIROS_INFERENCE_TOKEN=<same secret used by vLLM>
KAIROS_MODEL=Qwen3.6-35B-A3B
KAIROS_INFERENCE_TIMEOUT_MS=180000
KAIROS_INFERENCE_HEALTH_TIMEOUT_MS=10000
```

## Certification

Run the direct engine test:

```bash
export KAIROS_INFERENCE_URL=https://<private-inference-hostname>
export KAIROS_INFERENCE_TOKEN=<secret>
export KAIROS_MODEL=Qwen3.6-35B-A3B
bash smoke-test.sh
```

Then verify the Kairos Worker connection:

```bash
curl --fail --silent https://mmg-ios.info-mindsetmediagroup.workers.dev/api/inference/health
```

The engine is production-ready only when the Worker response reports:

```json
{"status":"ready","reachable":true,"provider":"kairos-private-runtime"}
```

## Operational boundaries

- This engine produces text, structured content, manuscript edits, book packages, product copy, and social content.
- Image, video, audio generation, and scanned-PDF OCR remain disabled.
- Customer or production actions still pass through Kairos approval, audit, verification, and rollback controls.
