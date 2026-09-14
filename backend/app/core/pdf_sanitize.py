import pymupdf

_SAFE_METADATA = {
    "title": "",
    "author": "",
    "subject": "",
    "keywords": "",
    "creator": "NSSF PDF Tools",
    "producer": "NSSF PDF Tools",
    "creationDate": "",
    "modDate": "",
    "trapped": "",
}


def sanitize_pdf_metadata(data: bytes) -> bytes:
    """Strips identifying metadata before a PDF is returned to the client: author,
    the originating software's creator/producer tags (which can embed local usernames
    or machine details), and the XMP metadata stream (often carries the same plus
    timestamps). Runs on every PDF response via `file_response`, not per-tool, so new
    tools get this for free.
    """
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception:
        return data
    try:
        doc.set_metadata(_SAFE_METADATA)
        try:
            doc.del_xml_metadata()
        except Exception:
            pass
        return doc.tobytes(garbage=4, deflate=True)
    except Exception:
        return data
    finally:
        doc.close()
