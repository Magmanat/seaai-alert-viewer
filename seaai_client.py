from __future__ import annotations

import asyncio
import contextlib

from config import Settings
from models import parse_seaai_message
from state import MemoryState

try:
    from websockets import connect
except ImportError:  # pragma: no cover - dependency installed via requirements.txt
    connect = None


class SeaAIWebSocketClient:
    def __init__(self, settings: Settings, state: MemoryState) -> None:
        self.settings = settings
        self.state = state
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        if self._task is None:
            return

        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run_forever(self) -> None:
        if not self.settings.seaai_ws_url:
            await self.state.set_connection_status(
                False, "SEAAI_WS_URL is not configured"
            )
            return

        if connect is None:
            await self.state.set_connection_status(
                False, "Missing dependency: websockets"
            )
            return

        reconnect_delay = max(1, self.settings.reconnect_delay_seconds)

        while True:
            try:
                async with connect(
                    self.settings.seaai_ws_url, ping_interval=20, ping_timeout=20
                ) as socket:
                    await self.state.set_connection_status(True)

                    async for raw_message in socket:
                        payload = (
                            raw_message.decode("utf-8", errors="ignore")
                            if isinstance(raw_message, bytes)
                            else str(raw_message)
                        )
                        try:
                            parsed = parse_seaai_message(payload)
                        except ValueError as exc:
                            await self.state.set_connection_status(True, str(exc))
                            continue
                        await self.state.ingest_message(parsed)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await self.state.set_connection_status(False, str(exc))
                await asyncio.sleep(reconnect_delay)
            else:
                await self.state.set_connection_status(
                    False, "Upstream websocket disconnected"
                )
                await asyncio.sleep(reconnect_delay)
