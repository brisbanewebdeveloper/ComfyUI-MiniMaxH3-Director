"""Local preset and preview routes for the context cards."""
import asyncio

from aiohttp import web
from server import PromptServer

from ..adapters import presets, preview_media, waveform
from ..core.context_build import item_from_widgets
from ..core.presets import ContextPreset, widget_values


def preset_root(request):
    return PromptServer.instance.user_manager.get_request_user_filepath(request, "minimax_h3_ng/contexts")


@PromptServer.instance.routes.get("/ng/presets")
async def list_presets(request):
    try:
        names = await asyncio.to_thread(presets.listing, preset_root(request), request.query.get("media", "image"))
        return web.json_response({"ok": True, "names": names})
    except (OSError, ValueError, KeyError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.post("/ng/presets")
async def write_preset(request):
    try:
        data = await request.json()
        item = item_from_widgets(data["media"], data["widgets"])
        preset = ContextPreset.from_dict({"schema_version": 1, "name": data["name"], "item": item.to_dict()})
        await asyncio.to_thread(presets.save, preset_root(request), preset.to_dict())
        return web.json_response({"ok": True, "name": preset.name})
    except (OSError, ValueError, KeyError, TypeError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.get("/ng/preset")
async def read_preset(request):
    try:
        preset = await asyncio.to_thread(presets.load, preset_root(request), request.query["name"])
        if preset.item.media != request.query["media"]:
            raise ValueError("Choose a preset for this context's media type.")
        return web.json_response({"ok": True, "widgets": widget_values(preset.item)})
    except (OSError, ValueError, KeyError, TypeError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.get("/ng/media")
async def media_preview(request):
    try:
        data = await asyncio.to_thread(preview_media.preview, request.query["media"], request.query["source"])
        return web.json_response({"ok": True, **data})
    except (OSError, ValueError, KeyError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.get("/ng/waveform")
async def media_waveform(request):
    try:
        data = await asyncio.to_thread(waveform.envelope, request.query["source"])
        return web.json_response({"ok": True, **data})
    except (OSError, ValueError, KeyError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)
