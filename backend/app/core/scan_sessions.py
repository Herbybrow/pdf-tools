"""In-memory pairing between a desktop browser tab (showing a QR code) and a phone
that scanned it, for the "scan from your phone" mode of Scan to PDF. A session only
relays raw captured photos from phone to desktop over a WebSocket -- the desktop does
all the actual perspective-correction and PDF assembly with its existing client-side
pipeline, exactly as it does for a webcam capture or a local file upload. Nothing here
is written to disk, and abandoned sessions (phone never connects, or the desktop tab
is closed mid-scan) are purged by a periodic sweep so this can't grow unbounded."""

import time

from fastapi import WebSocket

SESSION_TTL_SECONDS = 30 * 60


class ScanSession:
    def __init__(self) -> None:
        self.sockets: set[WebSocket] = set()
        self.page_count = 0
        self.last_activity = time.time()


class ScanSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, ScanSession] = {}

    def _touch(self, session_id: str) -> ScanSession:
        session = self._sessions.setdefault(session_id, ScanSession())
        session.last_activity = time.time()
        return session

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        session = self._touch(session_id)
        session.sockets.add(websocket)
        await websocket.send_json({"event": "connected", "totalPages": session.page_count})

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        session = self._sessions.get(session_id)
        if session:
            session.sockets.discard(websocket)

    async def broadcast_page_added(self, session_id: str, image_data_url: str) -> int:
        session = self._touch(session_id)
        session.page_count += 1
        message = {"event": "page_added", "totalPages": session.page_count, "imageDataUrl": image_data_url}
        stale: list[WebSocket] = []
        for ws in session.sockets:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            session.sockets.discard(ws)
        return session.page_count

    def sweep_stale(self) -> None:
        now = time.time()
        stale_ids = [
            sid for sid, session in self._sessions.items() if not session.sockets and now - session.last_activity > SESSION_TTL_SECONDS
        ]
        for sid in stale_ids:
            del self._sessions[sid]


scan_sessions = ScanSessionManager()
