import json

import pymupdf


def test_rotate_all_pages(client, pdf_a):
    response = client.post(
        "/api/v1/edit/rotate",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"angle": "90"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert all(page.rotation == 90 for page in doc)


def test_rotate_specific_pages_only(client, pdf_a):
    response = client.post(
        "/api/v1/edit/rotate",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"angle": "180", "pages": "1"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc[0].rotation == 180
    assert doc[1].rotation == 0


def test_crop_shrinks_page_box(client, pdf_a):
    doc_before = pymupdf.open(stream=pdf_a, filetype="pdf")
    original_width = doc_before[0].rect.width

    response = client.post(
        "/api/v1/edit/crop",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"top": "10", "bottom": "10", "left": "20", "right": "20"},
    )
    assert response.status_code == 200
    doc_after = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc_after[0].rect.width == original_width - 40


def test_add_page_numbers(client, pdf_a):
    response = client.post(
        "/api/v1/edit/add-page-numbers",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"format": "Page {page} of {total}", "position": "bottom-center"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert "Page 1 of 5" in doc[0].get_text()
    assert "Page 5 of 5" in doc[4].get_text()


def test_watermark_text_adds_visible_text(client, pdf_a):
    response = client.post(
        "/api/v1/edit/watermark",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"mode": "text", "text": "CONFIDENTIAL", "opacity": "30", "rotation": "45", "position": "center"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert "CONFIDENTIAL" in doc[0].get_text()


def test_forms_detect_and_fill_roundtrip(client):
    doc = pymupdf.open()
    page = doc.new_page()
    widget = pymupdf.Widget()
    widget.field_name = "full_name"
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    widget.rect = pymupdf.Rect(72, 72, 300, 100)
    page.add_widget(widget)
    form_bytes = doc.tobytes()
    doc.close()

    detect_response = client.post("/api/v1/edit/forms/detect", files={"file": ("form.pdf", form_bytes, "application/pdf")})
    assert detect_response.status_code == 200
    fields = detect_response.json()["fields"]
    assert any(f["name"] == "full_name" for f in fields)

    fill_response = client.post(
        "/api/v1/edit/forms/fill",
        files={"file": ("form.pdf", form_bytes, "application/pdf")},
        data={"values": json.dumps({"full_name": "Jane Mwangi"}), "flatten": "true"},
    )
    assert fill_response.status_code == 200
    filled_doc = pymupdf.open(stream=fill_response.content, filetype="pdf")
    assert "Jane Mwangi" in filled_doc[0].get_text()
    assert len(list(filled_doc[0].widgets() or [])) == 0
