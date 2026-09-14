import io
import os
import sys
import tempfile
import time

import pikepdf
import pymupdf
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.responses import PlainTextResponse

from app.core.config import settings
from app.core.middleware import MaxBodySizeMiddleware
from app.core.pdf_crypto import EncryptedPdfError, decrypt_if_needed
from app.core.subprocess_utils import run_cli
from app.core.tempfiles import cleanup_stale_temp
from app.core.validation import validate_pdf_upload


# --- Section 2.1: file size / page count guardrails --------------------------------


def test_max_body_size_middleware_rejects_oversized_content_length():
    tiny_app = FastAPI()
    tiny_app.add_middleware(MaxBodySizeMiddleware, max_bytes=10)

    @tiny_app.post("/echo")
    async def echo():
        return PlainTextResponse("ok")

    client = TestClient(tiny_app)
    response = client.post("/echo", content=b"x" * 100, headers={"content-length": "100"})
    assert response.status_code == 413
    assert "exceeds" in response.json()["detail"]


def test_max_body_size_middleware_allows_small_requests():
    tiny_app = FastAPI()
    tiny_app.add_middleware(MaxBodySizeMiddleware, max_bytes=10_000)

    @tiny_app.post("/echo")
    async def echo():
        return PlainTextResponse("ok")

    client = TestClient(tiny_app)
    response = client.post("/echo", content=b"small")
    assert response.status_code == 200


def test_validate_pdf_upload_rejects_too_many_pages(monkeypatch, pdf_a):
    monkeypatch.setattr(settings, "max_pages", 2)
    with pytest.raises(Exception) as exc_info:
        validate_pdf_upload(pdf_a, "a.pdf")  # pdf_a has 5 pages
    assert exc_info.value.status_code == 413


def test_validate_pdf_upload_allows_within_limit(monkeypatch, pdf_a):
    monkeypatch.setattr(settings, "max_pages", 100)
    validate_pdf_upload(pdf_a, "a.pdf")  # should not raise


def test_compress_endpoint_enforces_page_limit(client, monkeypatch, pdf_a):
    monkeypatch.setattr(settings, "max_pages", 1)
    response = client.post(
        "/api/v1/optimize/compress",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
    )
    assert response.status_code == 413


# --- Section 2.1: configurable engine timeouts --------------------------------------


def test_run_cli_converts_timeout_into_clean_timeout_error():
    with pytest.raises(TimeoutError, match="did not finish"):
        run_cli([sys.executable, "-c", "import time; time.sleep(5)"], timeout=1)


# --- Section 2.2: stale temp file sweep (SIGKILL / crash resilience) ---------------


def test_cleanup_stale_temp_removes_old_but_not_fresh_directories():
    stale_dir = settings.temp_root / "test-stale-leftover"
    fresh_dir = settings.temp_root / "test-fresh-inflight"
    stale_dir.mkdir(exist_ok=True)
    fresh_dir.mkdir(exist_ok=True)
    (stale_dir / "leftover.pdf").write_bytes(b"%PDF-1.4 fake")

    old_time = time.time() - (settings.temp_max_age_minutes + 5) * 60
    os.utime(stale_dir, (old_time, old_time))

    removed = cleanup_stale_temp()

    assert not stale_dir.exists()
    assert fresh_dir.exists()
    assert removed >= 1

    fresh_dir.rmdir()


# --- Section 2.3: encrypted PDF handling --------------------------------------------


def _make_encrypted_pdf(password: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Confidential NSSF content", fontsize=14)
    plain_bytes = doc.tobytes()
    doc.close()

    with pikepdf.open(io.BytesIO(plain_bytes)) as pdf:
        output = io.BytesIO()
        pdf.save(output, encryption=pikepdf.Encryption(user=password, owner=password, R=6))
        return output.getvalue()


def test_decrypt_if_needed_passes_through_unencrypted_pdf_unchanged(pdf_a):
    assert decrypt_if_needed(pdf_a, None, "a.pdf") == pdf_a


def test_decrypt_if_needed_raises_when_no_password_given():
    encrypted = _make_encrypted_pdf("secret")
    with pytest.raises(EncryptedPdfError) as exc_info:
        decrypt_if_needed(encrypted, None, "protected.pdf")
    assert exc_info.value.wrong_password is False


def test_decrypt_if_needed_raises_on_wrong_password():
    encrypted = _make_encrypted_pdf("secret")
    with pytest.raises(EncryptedPdfError) as exc_info:
        decrypt_if_needed(encrypted, "wrong-guess", "protected.pdf")
    assert exc_info.value.wrong_password is True


def test_decrypt_if_needed_succeeds_with_correct_password():
    encrypted = _make_encrypted_pdf("secret")
    decrypted = decrypt_if_needed(encrypted, "secret", "protected.pdf")
    doc = pymupdf.open(stream=decrypted, filetype="pdf")
    assert "Confidential NSSF content" in doc[0].get_text()
    assert doc.is_encrypted is False


def test_endpoint_returns_422_encrypted_flag_without_password(client):
    encrypted = _make_encrypted_pdf("secret")
    response = client.post(
        "/api/v1/organize/extract-pages",
        files={"file": ("protected.pdf", encrypted, "application/pdf")},
        data={"pages": "1"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["encrypted"] is True
    assert body["wrongPassword"] is False


def test_endpoint_succeeds_with_correct_password_end_to_end(client):
    encrypted = _make_encrypted_pdf("secret")
    response = client.post(
        "/api/v1/organize/extract-pages",
        files={"file": ("protected.pdf", encrypted, "application/pdf")},
        data={"pages": "1", "password": "secret"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert "Confidential NSSF content" in doc[0].get_text()


def test_endpoint_returns_422_wrong_password_flag(client):
    encrypted = _make_encrypted_pdf("secret")
    response = client.post(
        "/api/v1/organize/extract-pages",
        files={"file": ("protected.pdf", encrypted, "application/pdf")},
        data={"pages": "1", "password": "wrong-guess"},
    )
    assert response.status_code == 422
    assert response.json()["wrongPassword"] is True


# --- Zero-retention: process-wide TEMP/TMP redirect --------------------------------
#
# config.py redirects the process's TEMP/TMP env vars (and Python's own tempfile
# module default) into settings.temp_root at import time, specifically so that
# third-party engines (Ghostscript, Tesseract/ocrmypdf, LibreOffice, Playwright) --
# which pick a scratch directory via the OS temp convention rather than any path we
# pass them -- also land inside the one directory the stale-sweep monitors. Without
# this, those engines' own scratch files would silently accumulate outside the
# zero-retention guarantee. These assertions pin that behaviour so a future refactor
# of config.py can't silently drop it.


def test_temp_env_vars_point_at_monitored_temp_root():
    assert os.environ["TEMP"] == str(settings.temp_root)
    assert os.environ["TMP"] == str(settings.temp_root)


def test_tempfile_module_default_points_at_monitored_temp_root():
    assert tempfile.tempdir == str(settings.temp_root)
    assert os.path.samefile(tempfile.gettempdir(), settings.temp_root)


def test_bare_tempfile_call_with_no_explicit_dir_lands_in_temp_root():
    # Simulates what a third-party engine does internally: create a scratch file/dir
    # via the bare tempfile API with no explicit `dir=` argument. If the redirect in
    # config.py is working, this lands inside settings.temp_root (and therefore gets
    # swept by cleanup_stale_temp) rather than the OS-wide default temp location.
    with tempfile.NamedTemporaryFile(delete=False) as f:
        created_path = f.name
    try:
        assert os.path.dirname(os.path.abspath(created_path)) == str(settings.temp_root)
    finally:
        os.remove(created_path)
