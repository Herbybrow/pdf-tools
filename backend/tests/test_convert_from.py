import io
import zipfile

import pymupdf
from pptx.enum.text import PP_ALIGN

from app.services.convert_from_service import _infer_alignment, _order_blocks_by_reading_order


def test_infer_alignment_detects_centered_block():
    # Page 0-600, block 200-400 (100pt margin each side) -> centered
    assert _infer_alignment(200, 400, 0, 600) == PP_ALIGN.CENTER


def test_infer_alignment_detects_left_aligned_block():
    assert _infer_alignment(10, 200, 0, 600) == PP_ALIGN.LEFT


def test_infer_alignment_detects_right_aligned_block():
    assert _infer_alignment(400, 590, 0, 600) == PP_ALIGN.RIGHT


def test_infer_alignment_wide_block_defaults_to_left():
    assert _infer_alignment(10, 590, 0, 600) == PP_ALIGN.LEFT


def test_order_blocks_detects_two_column_gutter():
    blocks = [
        (350, 80, 550, 100, "Right Top", 0, 0),
        (50, 50, 250, 70, "Left Top", 0, 0),
        (350, 200, 550, 220, "Right Bottom", 0, 0),
        (50, 150, 250, 170, "Left Bottom", 0, 0),
    ]
    ordered = _order_blocks_by_reading_order(blocks, page_width=600)
    labels = [b[4] for b in ordered]
    assert labels == ["Left Top", "Left Bottom", "Right Top", "Right Bottom"]


def test_order_blocks_single_column_sorts_top_to_bottom():
    blocks = [
        (50, 200, 550, 220, "Second", 0, 0),
        (50, 50, 550, 70, "First", 0, 0),
        (50, 350, 550, 370, "Third", 0, 0),
    ]
    ordered = _order_blocks_by_reading_order(blocks, page_width=600)
    assert [b[4] for b in ordered] == ["First", "Second", "Third"]


def test_pdf_to_word(client, pdf_a):
    from docx import Document

    response = client.post("/api/v1/convert/pdf-to-word", files={"file": ("a.pdf", pdf_a, "application/pdf")})
    assert response.status_code == 200
    document = Document(io.BytesIO(response.content))
    full_text = "\n".join(p.text for p in document.paragraphs)
    assert "Document A - Page 1" in full_text


def test_pdf_to_powerpoint_orders_two_column_layout_correctly(client):
    """Builds a genuinely two-column page (left column A1/A2 top-to-bottom, right
    column B1/B2 top-to-bottom, interleaved in y so a naive top-to-bottom scan would
    read them out of column order) and confirms the gutter-detection reading order
    fix produces left-column-then-right-column, not interleaved-by-y."""
    from pptx import Presentation

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=400)
    page.insert_text((50, 50), "Left Top A1", fontsize=12)
    page.insert_text((350, 80), "Right Top B1", fontsize=12)
    page.insert_text((50, 150), "Left Bottom A2", fontsize=12)
    page.insert_text((350, 200), "Right Bottom B2", fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()

    response = client.post("/api/v1/convert/pdf-to-powerpoint", files={"file": ("cols.pdf", pdf_bytes, "application/pdf")})
    assert response.status_code == 200
    presentation = Presentation(io.BytesIO(response.content))
    slide = presentation.slides[0]
    texts_in_order = [shape.text_frame.text for shape in slide.shapes if shape.has_text_frame and shape.text_frame.text]

    left_positions = [texts_in_order.index(t) for t in texts_in_order if t.startswith("Left")]
    right_positions = [texts_in_order.index(t) for t in texts_in_order if t.startswith("Right")]
    assert max(left_positions) < min(right_positions), f"expected left column before right column, got order: {texts_in_order}"


def test_pdf_to_powerpoint(client, pdf_a):
    from pptx import Presentation

    response = client.post("/api/v1/convert/pdf-to-powerpoint", files={"file": ("a.pdf", pdf_a, "application/pdf")})
    assert response.status_code == 200
    presentation = Presentation(io.BytesIO(response.content))
    assert len(presentation.slides) == 5  # one slide per source page


def test_pdf_to_excel_detects_ruled_table(client):
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer)
    table = Table([["Name", "Amount"], ["Alice", "100"], ["Bob", "200"]])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]))
    doc.build([table])
    pdf_bytes = buffer.getvalue()

    response = client.post("/api/v1/convert/pdf-to-excel", files={"file": ("table.pdf", pdf_bytes, "application/pdf")})
    assert response.status_code == 200
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(response.content))
    sheet = workbook[workbook.sheetnames[0]]
    values = [cell.value for row in sheet.iter_rows() for cell in row if cell.value is not None]
    assert "Alice" in values
    assert "200" in values


def test_pdf_to_excel_detects_borderless_table(client):
    """No GRID style at all -- just aligned text columns, no ruling lines -- exercising
    the text-alignment-based fallback strategy for borderless tables."""
    from reportlab.platypus import SimpleDocTemplate, Table

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer)
    table = Table(
        [
            ["Employee", "Contribution"],
            ["Juma Hassan", "150000"],
            ["Amina Said", "220000"],
        ],
        colWidths=[150, 150],
    )
    doc.build([table])
    pdf_bytes = buffer.getvalue()

    response = client.post("/api/v1/convert/pdf-to-excel", files={"file": ("borderless.pdf", pdf_bytes, "application/pdf")})
    assert response.status_code == 200
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(response.content))
    sheet = workbook[workbook.sheetnames[0]]
    values = [cell.value for row in sheet.iter_rows() for cell in row if cell.value is not None]
    assert "Juma Hassan" in values
    assert "220000" in values


def test_pdf_to_jpg_renders_one_image_per_page(client, pdf_b):
    response = client.post(
        "/api/v1/convert/pdf-to-jpg",
        files={"file": ("b.pdf", pdf_b, "application/pdf")},
        data={"format": "png", "dpi": "150"},
    )
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert len(archive.namelist()) == 3
    assert all(name.endswith(".png") for name in archive.namelist())


def test_pdf_to_pdfa_produces_valid_pdf(client, pdf_a):
    response = client.post(
        "/api/v1/convert/pdf-to-pdfa",
        files={"file": ("a.pdf", pdf_a, "application/pdf")},
        data={"standard": "pdfa-2b"},
    )
    assert response.status_code == 200
    doc = pymupdf.open(stream=response.content, filetype="pdf")
    assert doc.page_count == 5


def test_pdf_to_markdown_promotes_large_text_to_heading(client):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Big Title", fontsize=28)
    page.insert_text((72, 120), "Regular body text.", fontsize=11)
    pdf_bytes = doc.tobytes()
    doc.close()

    response = client.post("/api/v1/convert/pdf-to-markdown", files={"file": ("doc.pdf", pdf_bytes, "application/pdf")})
    assert response.status_code == 200
    markdown = response.content.decode("utf-8")
    assert "# Big Title" in markdown
    assert "Regular body text." in markdown
