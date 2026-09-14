import json

import pymupdf


def test_compose_reorders_and_rotates_single_source(client, pdf_b):
    layout = [
        {"source": 0, "page": 2, "rotation": 0},
        {"source": 0, "page": 0, "rotation": 90},
    ]
    response = client.post(
        "/api/v1/organize/compose",
        files=[("files", ("b.pdf", pdf_b, "application/pdf"))],
        data={"layout": json.dumps(layout)},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 2
    assert "Page 3" in doc[0].get_text()
    assert "Page 1" in doc[1].get_text()
    assert doc[1].rotation == 90


def test_compose_inserts_pages_from_secondary_document(client, pdf_a, pdf_b):
    layout = [
        {"source": 0, "page": 0, "rotation": 0},
        {"source": 1, "page": 0, "rotation": 0},
        {"source": 0, "page": 1, "rotation": 0},
    ]
    response = client.post(
        "/api/v1/organize/compose",
        files=[
            ("files", ("a.pdf", pdf_a, "application/pdf")),
            ("files", ("b.pdf", pdf_b, "application/pdf")),
        ],
        data={"layout": json.dumps(layout)},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 3
    assert "Document A - Page 1" in doc[0].get_text()
    assert "Document B - Page 1" in doc[1].get_text()
    assert "Document A - Page 2" in doc[2].get_text()


def test_compose_supports_more_than_two_source_documents(client, pdf_a, pdf_b):
    """Merge PDF's use case: an arbitrary number of source files, not just two."""
    layout = [
        {"source": 2, "page": 0, "rotation": 0},
        {"source": 0, "page": 0, "rotation": 0},
        {"source": 1, "page": 0, "rotation": 0},
    ]
    response = client.post(
        "/api/v1/organize/compose",
        files=[
            ("files", ("a.pdf", pdf_a, "application/pdf")),
            ("files", ("b.pdf", pdf_b, "application/pdf")),
            ("files", ("a2.pdf", pdf_a, "application/pdf")),
        ],
        data={"layout": json.dumps(layout)},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 3
    assert "Document A - Page 1" in doc[0].get_text()
    assert "Document A - Page 1" in doc[1].get_text()
    assert "Document B - Page 1" in doc[2].get_text()


def test_compose_rejects_empty_layout(client, pdf_a):
    response = client.post(
        "/api/v1/organize/compose",
        files=[("files", ("a.pdf", pdf_a, "application/pdf"))],
        data={"layout": json.dumps([])},
    )
    assert response.status_code == 400
