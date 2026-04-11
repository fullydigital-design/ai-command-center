# ============================================================
# routers/ai_proxy.py - OpenRouter AI proxy (optional)
# ============================================================

import logging

import aiohttp
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from config import DEFAULT_AI_MODEL, OPENROUTER_API_KEY

logger = logging.getLogger("ai_command_center.ai_proxy")

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@router.post("/chat")
async def ai_chat(request: Request):
    """
    Proxy chat completions to OpenRouter.
    Supports both streaming (SSE) and non-streaming (JSON) modes.
    """
    if not OPENROUTER_API_KEY:
        return {
            "error": "OPENROUTER_API_KEY not configured. Set it in .env or environment. AI features also work client-side via Settings."
        }

    try:
        body = await request.json()
    except Exception as e:
        logger.warning("Invalid JSON in AI chat request: %s", e)
        return {"error": "Invalid JSON body"}

    messages = body.get("messages", [])
    if not messages:
        return {"error": "No messages provided"}

    model = body.get("model", DEFAULT_AI_MODEL)
    stream = bool(body.get("stream", False))

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AI Command Center",
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }

    if not stream:
        try:
            timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
                    data = await resp.json(content_type=None)
                    if resp.status != 200:
                        error_msg = data.get("error", {}) if isinstance(data, dict) else data
                        if isinstance(error_msg, dict):
                            error_msg = error_msg.get("message", str(error_msg))
                        return {"error": f"OpenRouter returned {resp.status}: {error_msg}"}
                    return data
        except aiohttp.ClientError as e:
            logger.warning("OpenRouter connection failed: %s", e)
            return {"error": f"Failed to reach OpenRouter: {str(e)[:200]}"}
        except Exception as e:
            logger.error("AI proxy error: %s", e)
            return {"error": f"Proxy error: {str(e)[:200]}"}

    async def stream_generator():
        timeout = aiohttp.ClientTimeout(total=120)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
                    if resp.status != 200:
                        error_body = await resp.text()
                        yield {"data": f'{{"error": "OpenRouter {resp.status}: {error_body[:200]}"}}'}
                        return

                    buffer = ""
                    async for chunk in resp.content.iter_any():
                        buffer += chunk.decode("utf-8", errors="replace")

                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue

                            data_str = line[6:]
                            if data_str == "[DONE]":
                                yield {"data": "[DONE]"}
                            else:
                                yield {"data": data_str}

                    # Flush trailing line without newline if present
                    tail = buffer.strip()
                    if tail.startswith("data: "):
                        data_str = tail[6:]
                        if data_str == "[DONE]":
                            yield {"data": "[DONE]"}
                        elif data_str:
                            yield {"data": data_str}

        except aiohttp.ClientError as e:
            logger.warning("OpenRouter stream error: %s", e)
            yield {"data": f'{{"error": "Stream error: {str(e)[:200]}"}}'}
        except Exception as e:
            logger.error("AI stream proxy error: %s", e)
            yield {"data": f'{{"error": "Stream proxy error: {str(e)[:200]}"}}'}

    return EventSourceResponse(stream_generator())


@router.get("/models")
async def list_models():
    """Return a curated list of recommended models."""
    return {
        "models": [
            {
                "id": "anthropic/claude-sonnet-4-20250514",
                "name": "Claude Sonnet 4",
                "provider": "Anthropic",
            },
            {
                "id": "anthropic/claude-3.5-sonnet",
                "name": "Claude 3.5 Sonnet",
                "provider": "Anthropic",
            },
            {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
            {
                "id": "openai/gpt-4o-mini",
                "name": "GPT-4o Mini",
                "provider": "OpenAI",
            },
            {
                "id": "google/gemini-2.0-flash-001",
                "name": "Gemini 2.0 Flash",
                "provider": "Google",
            },
            {
                "id": "deepseek/deepseek-chat",
                "name": "DeepSeek Chat",
                "provider": "DeepSeek",
            },
            {
                "id": "meta-llama/llama-3.1-70b-instruct",
                "name": "Llama 3.1 70B",
                "provider": "Meta",
            },
        ],
        "default": "anthropic/claude-sonnet-4-20250514",
        "api_key_set": bool(OPENROUTER_API_KEY),
    }
