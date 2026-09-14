import pymupdf


def test_compress_returns_valid_smaller_or_equal_pdf(client, pdf_a):
    response = client.post(
        "/api/v1/optimize/compress",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"level": "screen"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 5


def test_repair_returns_valid_pdf(client, pdf_a):
    response = client.post("/api/v1/optimize/repair", files={"file": ("a.pdf", pdf_a, "application/pdf")})
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 5


def test_ocr_adds_searchable_text_layer_to_scanned_page(client):
    """Builds a PDF containing only a rendered image of text (no real text layer),
    simulating a scanned document, and confirms OCR makes it searchable."""
    text_doc = pymupdf.open()
    text_page = text_doc.new_page()
    text_page.insert_text((72, 72), "Hello NSSF", fontsize=32)
    pix = text_page.get_pixmap(dpi=150)
    text_doc.close()

    scanned_doc = pymupdf.open()
    scanned_page = scanned_doc.new_page(width=pix.width, height=pix.height)
    scanned_page.insert_image(scanned_page.rect, pixmap=pix)
    scanned_bytes = scanned_doc.tobytes()
    scanned_doc.close()

    before = pymupdf.open(stream=scanned_bytes, filetype="pdf")
    assert before[0].get_text().strip() == ""

    response = client.post(
        "/api/v1/optimize/ocr",
        files={"file": ("scanned.pdf", scanned_bytes, "application/pdf")},
        data={"language": "eng"},
    )
    assert response.status_code == 200
    after = pymupdf.open(stream=response.content, filetype="pdf")
    assert "NSSF" in after[0].get_text()
