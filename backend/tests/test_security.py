import io
import json

import pikepdf
import pymupdf


def test_protect_requires_password_to_open(client, pdf_a):
    response = client.post(
        "/api/v1/security/protect",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"userPassword": "secret123", "encryption": "aes256"},
    )
    assert response.status_code == 200
    try:
        pikepdf.open(io.BytesIO(response.content))
        assert False, "opening without a password should have failed"
    except pikepdf.PasswordError:
        pass
    with pikepdf.open(io.BytesIO(response.content), password="secret123") as pdf:
        assert len(pdf.pages) == 5


def test_protect_then_unlock_roundtrip(client, pdf_a):
    protect_response = client.post(
        "/api/v1/security/protect",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"userPassword": "secret123"},
    )
    assert protect_response.status_code == 200

    unlock_response = client.post(
        "/api/v1/security/unlock",
        files={"file": ("a.pdf", protect_response.content, "application/pdf")},
        data={"password": "secret123"},
    )
    assert unlock_response.status_code == 200
    with pikepdf.open(io.BytesIO(unlock_response.content)) as pdf:
        assert len(pdf.pages) == 5


def test_unlock_with_wrong_password_fails_cleanly(client, pdf_a):
    protect_response = client.post(
        "/api/v1/security/protect",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"userPassword": "secret123"},
    )
    unlock_response = client.post(
        "/api/v1/security/unlock",
        files={"file": ("a.pdf", protect_response.content, "application/pdf")},
        data={"password": "wrong-password"},
    )
    assert unlock_response.status_code == 400


def test_redact_removes_underlying_text_not_just_overlay(client):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "SECRET: 123-45-6789", fontsize=14)
    page.insert_text((72, 150), "This part stays visible.", fontsize=14)
    pdf_bytes = doc.tobytes()
    rect = page.search_for("SECRET: 123-45-6789")[0]
    doc.close()

    regions = [{"page": 0, "x0": rect.x0, "y0": rect.y0, "x1": rect.x1, "y1": rect.y1}]
    response = client.post(
        "/api/v1/security/redact",
        files={"file": ("doc.pdf", pdf_bytes, "application/pdf")},
        data={"regions": json.dumps(regions)},
    )
    assert response.status_code == 200
    result_doc = pymupdf.open(stream=response.content, filetype="pdf")
    text = result_doc[0].get_text()
    assert "123-45-6789" not in text
    assert "This part stays visible." in text


def test_compare_detects_text_changes(client, pdf_a, pdf_b):
    response = client.post(
        "/api/v1/security/compare",
        files={"fileA": ("a.pdf", pdf_a, "application/pdf"), "fileB": ("b.pdf", pdf_b, "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pageCountA"] == 5
    assert body["pageCountB"] == 3
    assert body["pages"][0]["hasTextChanges"] is True
    assert body["pages"][0]["imageA"] is not None
