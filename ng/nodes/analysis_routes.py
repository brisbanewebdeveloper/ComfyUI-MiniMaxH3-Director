"""Analysis runs only on an explicit context-card request; rendering does not use a provider."""
import asyncio

import aiohttp
from aiohttp import web
from server import PromptServer

from ..adapters.analysis import analyze
from ..adapters.analyze_all import analyze_all
from ..adapters.auto_direct import direct


def _answer(data):
    return web.json_response({"ok": True, **data})


def _failure(error):
    return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.post("/ng/analyze")
async def analyze_context(request):
    try:
        return _answer({"suggestion": await analyze(await request.json())})
    except (ValueError, KeyError, TypeError, OSError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return _failure(error)


@PromptServer.instance.routes.post("/ng/analyze_all")
async def analyze_every_context(request):
    try:
        return _answer(await analyze_all(await request.json()))
    except (ValueError, KeyError, TypeError, OSError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return _failure(error)


@PromptServer.instance.routes.post("/ng/direct")
async def direct_scenes(request):
    try:
        return _answer({"suggestion": await direct(await request.json())})
    except (ValueError, KeyError, TypeError, OSError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return _failure(error)
