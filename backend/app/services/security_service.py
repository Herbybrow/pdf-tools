import base64
import difflib
import io

import numpy as np
import pikepdf
import pymupdf
from PIL import Image


def protect_pdf(
    data: bytes,
    user_password: str,
    owner_password: str = "",
    encryption: str = "aes256",
    allow_printing: bool = True,
    allow_copying: bool = False,
) -> bytes:
    if not user_password:
        raise ValueError("A password to open the PDF is required.")
    try:
        pdf_ctx = pikepdf.open(io.BytesIO(data))
    except pikepdf.PasswordError as exc:
        raise ValueError(
            "This PDF is already password-protected. Use Unlock PDF first, then Protect PDF with the new settings."
        ) from exc
    with pdf_ctx as pdf:
        permissions = pikepdf.Permissions(
            extract=allow_copying,
            print_lowres=allow_printing,
            print_highres=allow_printing,
            modify_other=False,
            modify_annotation=False,
            modify_form=False,
            modify_assembly=False,
        )
        r_level = 6 if encryption == "aes256" else 4
        encryption_obj = pikepdf.Encryption(
            user=user_password,
            owner=owner_password or user_password,
            R=r_level,
            allow=permissions,
            aes=True,
        )
        output = io.BytesIO()
        pdf.save(output, encryption=encryption_obj)
        return output.getvalue()


def unlock_pdf(data: bytes, password: str) -> bytes:
    try:
        with pikepdf.open(io.BytesIO(data), password=password) as pdf:
            output = io.BytesIO()
            pdf.save(output)
            return output.getvalue()
    except pikepdf.PasswordError as exc:
        raise ValueError("Incorrect password.") from exc


def redact_pdf(data: bytes, regions: list[dict]) -> bytes:
    """Genuinely strips the underlying text/image content beneath each region (PyMuPDF's
    add_redact_annot + apply_redactions), not just a black overlay shape drawn on top."""
    if not regions:
        raise ValueError("Please select at least one region to redact.")
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        by_page: dict[int, list[pymupdf.Rect]] = {}
        for region in regions:
            page_index = int(region["page"])
            rect = pymupdf.Rect(region["x0"], region["y0"], region["x1"], region["y1"])
            by_page.setdefault(page_index, []).append(rect)
        for page_index, rects in by_page.items():
            if page_index < 0 or page_index >= doc.page_count:
                raise ValueError(f"Page {page_index + 1} is out of range.")
            page = doc[page_index]
            for rect in rects:
                page.add_redact_annot(rect, fill=(0, 0, 0))
            page.apply_redactions()
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def _pixel_diff_png(pix_a: pymupdf.Pixmap, pix_b: pymupdf.Pixmap) -> bytes:
    arr_a = np.frombuffer(pix_a.samples, dtype=np.uint8).reshape(pix_a.height, pix_a.width, pix_a.n)
    arr_b = np.frombuffer(pix_b.samples, dtype=np.uint8).reshape(pix_b.height, pix_b.width, pix_b.n)
    rgb_a = arr_a[:, :, :3] if arr_a.shape[2] >= 3 else np.repeat(arr_a[:, :, :1], 3, axis=2)
    rgb_b = arr_b[:, :, :3] if arr_b.shape[2] >= 3 else np.repeat(arr_b[:, :, :1], 3, axis=2)
    diff = np.abs(rgb_a.astype(int) - rgb_b.astype(int)).sum(axis=2)
    mask = diff > 30

    overlay = rgb_a.copy()
    overlay[mask] = [255, 0, 0]
    buffer = io.BytesIO()
    Image.fromarray(overlay).save(buffer, format="PNG")
    return buffer.getvalue()


def compare_pdfs(data_a: bytes, data_b: bytes, dpi: int = 100) -> dict:
    doc_a = pymupdf.open(stream=data_a, filetype="pdf")
    doc_b = pymupdf.open(stream=data_b, filetype="pdf")
    try:
        page_count = max(doc_a.page_count, doc_b.page_count)
        matrix = pymupdf.Matrix(dpi / 72, dpi / 72)
        pages_result = []

        for i in range(page_count):
            text_a = doc_a[i].get_text() if i < doc_a.page_count else ""
            text_b = doc_b[i].get_text() if i < doc_b.page_count else ""
            diff_lines = list(difflib.unified_diff(text_a.splitlines(), text_b.splitlines(), lineterm=""))

            pix_a = doc_a[i].get_pixmap(matrix=matrix) if i < doc_a.page_count else None
            pix_b = doc_b[i].get_pixmap(matrix=matrix) if i < doc_b.page_count else None

            diff_image_b64 = None
            if pix_a is not None and pix_b is not None and pix_a.width == pix_b.width and pix_a.height == pix_b.height:
                diff_image_b64 = base64.b64encode(_pixel_diff_png(pix_a, pix_b)).decode("ascii")

            pages_result.append(
                {
                    "page": i,
                    "textDiff": diff_lines,
                    "hasTextChanges": bool(diff_lines),
                    "imageA": base64.b64encode(pix_a.tobytes("png")).decode("ascii") if pix_a is not None else None,
                    "imageB": base64.b64encode(pix_b.tobytes("png")).decode("ascii") if pix_b is not None else None,
                    "diffImage": diff_image_b64,
                }
            )

        return {"pageCountA": doc_a.page_count, "pageCountB": doc_b.page_count, "pages": pages_result}
    finally:
        doc_a.close()
        doc_b.close()


