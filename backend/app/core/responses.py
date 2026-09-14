import io
import zipfile

from fastapi import Response

from app.core.pdf_sanitize import sanitize_pdf_metadata


def file_response(
    data: bytes,
    filename: str,
    media_type: str = "application/octet-stream",
    sanitize: bool = True,
) -> Response:
    """Wraps bytes as a downloadable response. PDF output is metadata-sanitized by
    default -- pass sanitize=False for a PDF that must stay byte-exact (an encrypted
    PDF from Protect, or a cryptographically signed PDF), since re-serializing would
    strip the encryption or invalidate the signature.
    """
    if sanitize and media_type == "application/pdf":
        data = sanitize_pdf_metadata(data)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def zip_response(files: dict[str, bytes], filename: str) -> Response:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return file_response(buffer.getvalue(), filename, media_type="application/zip")
