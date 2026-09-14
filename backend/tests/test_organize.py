import io
import zipfile

import pymupdf


def test_merge_combines_page_counts(client, pdf_a, pdf_b):
    response = client.post(
        "/api/v1/organize/merge",
        files=[("files", ("a.pdf", pdf_a, "application/pdf")), ("files", ("b.pdf", pdf_b, "application/pdf"))],
    )
    assert response.status_code == 200
    merged = pymupdf.open(stream=response.content, filetype="pdf")
    assert merged.page_count == 8


def test_merge_requires_at_least_two_files(client, pdf_a):
    response = client.post("/api/v1/organize/merge", files=[("files", ("a.pdf", pdf_a, "application/pdf"))])
    assert response.status_code == 400


def test_extract_pages_returns_only_requested_pages(client, pdf_a):
    response = client.post(
        "/api/v1/organize/extract-pages",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"pages": "2-3"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 2
    assert "Page 2" in doc[0].get_text()


def test_remove_pages_shrinks_document(client, pdf_a):
    response = client.post(
        "/api/v1/organize/remove-pages",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"pages": "1"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 4
    assert "Page 2" in doc[0].get_text()


def test_split_burst_produces_one_file_per_page(client, pdf_b):
    response = client.post(
        "/api/v1/organize/split",
        files={"file": ("b.pdf", pdf_b, "application/pdf")},
        data={"mode": "burst"},
    )
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert len(archive.namelist()) == 3


def test_reorder_changes_page_sequence(client, pdf_b):
    response = client.post(
        "/api/v1/organize/reorder",
        files={"file": ("b.pdf", pdf_b, "application/pdf")},
        data={"order": "3,2,1"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert "Page 3" in doc[0].get_text()
    assert "Page 1" in doc[2].get_text()
