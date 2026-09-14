import json

import pymupdf


def test_simple_two_step_pipeline(client, pdf_a):
    pipeline = [
        {"step": "rotate", "params": {"angle": 90}},
        {"step": "add-page-numbers", "params": {"format": "Page {page} of {total}"}},
    ]
    response = client.post(
        "/api/v1/workflow/execute",
        files=[("files", ("a.pdf", pdf_a, "application/pdf"))],
        data={"pipeline": json.dumps(pipeline)},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc[0].rotation == 90
    assert "Page 1 of 5" in doc[0].get_text()


def test_unknown_step_returns_400(client, pdf_a):
    pipeline = [{"step": "not-a-real-step", "params": {}}]
    response = client.post(
        "/api/v1/workflow/execute",
        files=[("files", ("a.pdf", pdf_a, "application/pdf"))],
        data={"pipeline": json.dumps(pipeline)},
    )
    assert response.status_code == 400


def test_full_spec_example_pipeline(client, pdf_a, pdf_b):
    """Reproduces the master spec's own example pipeline verbatim:
    merge -> ocr -> watermark -> compress -> convert-pdfa."""
    pipeline = {
        "pipeline": [
            {"step": "merge", "params": {}},
            {"step": "ocr", "params": {"language": "eng"}},
            {"step": "watermark", "params": {"text": "NSSF CONFIDENTIAL", "opacity": 0.3}},
            {"step": "compress", "params": {"level": "recommended"}},
            {"step": "convert-pdfa", "params": {"standard": "pdfa-2b"}},
        ]
    }
    response = client.post(
        "/api/v1/workflow/execute",
        files=[("files", ("a.pdf", pdf_a, "application/pdf")), ("files", ("b.pdf", pdf_b, "application/pdf"))],
        data={"pipeline": json.dumps(pipeline)},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 8  # merged 5 + 3 pages
    assert "NSSF CONFIDENTIAL" in doc[0].get_text()
