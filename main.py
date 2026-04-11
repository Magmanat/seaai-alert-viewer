from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from config import settings
from models import parse_seaai_message
from seaai_client import SeaAIWebSocketClient
from state import MemoryState


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
TEMPLATES_DIR = APP_DIR / "templates"

memory_state = MemoryState(settings)
seaai_client = SeaAIWebSocketClient(settings, memory_state)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await seaai_client.start()
    try:
        yield
    finally:
        await seaai_client.stop()


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(TEMPLATES_DIR / "index.html")


@app.get("/health")
async def health() -> dict:
    snapshot = await memory_state.build_snapshot()
    return {
        "ok": True,
        "status": snapshot["status"],
        "alertCount": len(snapshot["alerts"]),
    }


@app.get("/api/state")
async def get_state() -> dict:
    return await memory_state.build_snapshot()


@app.get("/api/snapshots/{group_id}/{kind}")
async def get_snapshot(group_id: str, kind: str) -> Response:
    asset = await memory_state.get_snapshot_asset(group_id, kind)
    if asset is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return Response(content=asset.content, media_type=asset.mime_type)


@app.post("/api/mock-alert")
async def mock_alert(request: Request) -> dict:
    payload = (await request.body()).decode("utf-8", errors="ignore")
    if not payload.strip():
        raise HTTPException(status_code=400, detail="Request body is empty")
    try:
        parsed = parse_seaai_message(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    accepted = await memory_state.ingest_message(parsed)
    return {"accepted": accepted}


@app.websocket("/ws/ui")
async def ui_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = await memory_state.register_subscriber()
    try:
        while True:
            snapshot = await queue.get()
            await websocket.send_json(snapshot)
    except WebSocketDisconnect:
        pass
    finally:
        await memory_state.unregister_subscriber(queue)


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
