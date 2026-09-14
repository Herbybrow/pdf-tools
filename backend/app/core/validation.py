import pymupdf
from fastapi import HTTPException

from app.core.config import settings


def validate_pdf_upload(data: bytes, filename: str | None = None) -> None:
    """Opens the upload just far enough to enforce the page-count guardrail (cheap --
    PyMuPDF doesn't eagerly parse content streams), then closes it. Byte-size is
    enforced globally by MaxBodySizeMiddleware before this ever runs; this catches the
    "small file, absurd page count" case that a byte cap alone would miss.
    """
    name = filename or "file"
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception:
        return  # not a valid PDF at all -- let the actual tool raise a clearer, tool-specific error
    try:
        if doc.page_count > settings.max_pages:
            raise HTTPException(
                status_code=413,
                detail=f"'{name}' has {doc.page_count} pages, which exceeds the {settings.max_pages}-page limit.",
            )
    finally:
        doc.close()
