import io

import pikepdf
import pymupdf

from app.core.pdf_sanitize import sanitize_pdf_metadata


def test_sanitize_strips_author_and_producer_tags():
    doc = pymupdf.open()
    doc.new_page()
    doc.set_metadata(
        {
            "author": "jsmith",
            "producer": "Some Tool 3.2 on DESKTOP-ABC123",
            "creator": "Some Tool",
            "title": "Internal Draft",
        }
    )
    data = doc.tobytes()
    doc.close()

    sanitized = sanitize_pdf_metadata(data)
    result = pymupdf.open(stream=sanitized, filetype="pdf")
    meta = result.metadata
    assert meta["author"] == ""
    assert "DESKTOP" not in meta["producer"]
    assert meta["title"] == ""


def test_sanitize_removes_xmp_metadata():
    doc = pymupdf.open()
    doc.new_page()
    doc.set_xml_metadata("<x:xmpmeta xmlns:x='adobe:ns:meta/'>leaked-machine-info</x:xmpmeta>")
    data = doc.tobytes()
    doc.close()

    sanitized = sanitize_pdf_metadata(data)
    assert b"leaked-machine-info" not in sanitized


def test_protect_endpoint_survives_sanitize_opt_out(client, pdf_a):
    """Regression guard: Protect PDF must stay byte-exact enough to still open with the
    password after the response passes through file_response's sanitize step."""
    response = client.post(
        "/api/v1/security/protect",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"userPassword": "secret123"},
    )
    assert response.status_code == 200
    with pikepdf.open(io.BytesIO(response.content), password="secret123") as pdf:
        assert len(pdf.pages) == 5
