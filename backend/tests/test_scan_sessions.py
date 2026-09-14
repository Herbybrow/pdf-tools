import base64
import io
import time

from PIL import Image

from app.core.scan_sessions import ScanSessionManager


def _tiny_jpeg_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), (200, 60, 30)).save(buffer, format="JPEG")
    return buffer.getvalue()


def test_scan_session_relays_uploaded_photo_to_connected_socket(client):
    session_id = "test-session-1"
    with client.websocket_connect(f"/api/v1/organize/scan-session/{session_id}/ws") as ws:
        connected = ws.receive_json()
        assert connected["event"] == "connected"
        assert connected["totalPages"] == 0

        response = client.post(
            f"/api/v1/organize/scan-session/{session_id}/upload",
            files={"image": ("page.jpg", _tiny_jpeg_bytes(), "image/jpeg")},
        )
        assert response.status_code == 200
        assert response.json()["totalPages"] == 1

        pushed = ws.receive_json()
        assert pushed["event"] == "page_added"
        assert pushed["totalPages"] == 1
        assert pushed["imageDataUrl"].startswith("data:image/jpeg;base64,")
        # Round-trips back to genuine image bytes, not a placeholder or corrupted encode.
        raw = base64.b64decode(pushed["imageDataUrl"].split(",", 1)[1])
        Image.open(io.BytesIO(raw)).verify()


def test_scan_session_upload_with_no_listener_still_succeeds(client):
    # A phone can start uploading before the desktop's socket is (re)connected --
    # the photo just isn't delivered to anyone yet; it should never be an error.
    response = client.post(
        "/api/v1/organize/scan-session/never-connected/upload",
        files={"image": ("page.jpg", _tiny_jpeg_bytes(), "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json()["totalPages"] == 1


def test_sweep_stale_removes_old_disconnected_sessions_but_not_fresh_ones():
    manager = ScanSessionManager()
    manager._touch("stale")
    manager._touch("fresh")
    manager._sessions["stale"].last_activity = time.time() - 3600
    manager.sweep_stale()
    assert "stale" not in manager._sessions
    assert "fresh" in manager._sessions
