"""Analysis runs only on an explicit context-card request; rendering does not use a provider."""
import asyncio

import aiohttp
from aiohttp import web
from server import PromptServer

from ..adapters.analysis import analyze
from ..adapters.auto_direct import direct


@PromptServer.instance.routes.post("/ng/analyze")
async def analyze_context(request):
    try:
        suggestion = await analyze(await request.json())
        return web.json_response({"ok": True, "suggestion": suggestion})
    except (ValueError, KeyError, TypeError, OSError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.post("/ng/direct")
async def direct_scenes(request):
    try:
        suggestion = await direct(await request.json())
        return web.json_response({"ok": True, "suggestion": suggestion})
    except (ValueError, KeyError, TypeError, OSError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)
