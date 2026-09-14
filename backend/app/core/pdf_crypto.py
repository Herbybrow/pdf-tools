import io

import pikepdf


class EncryptedPdfError(Exception):
    """Raised when a PDF is password-protected. The FastAPI exception handler in
    app.main converts this into a consistent {"detail": ..., "encrypted": true} 422
    response that the frontend recognizes and responds to with a password prompt."""

    def __init__(self, filename: str, wrong_password: bool = False):
        self.filename = filename
        self.wrong_password = wrong_password
        message = (
            f"The password for '{filename}' was incorrect." if wrong_password else f"'{filename}' is password-protected."
        )
        super().__init__(message)


def decrypt_if_needed(data: bytes, password: str | None, filename: str | None = None) -> bytes:
    """Returns `data` unchanged if it's not an encrypted PDF. If it is, decrypts it in
    memory with `password` and returns the plain PDF bytes -- every downstream engine
    (PyMuPDF, Ghostscript, LibreOffice, Tesseract/ocrmypdf) then just sees a normal
    unencrypted PDF, no per-engine password handling needed. Raises EncryptedPdfError
    if no password was given, or if the one given doesn't work. Never writes the
    password or the decrypted document to disk.
    """
    name = filename or "file"
    try:
        with pikepdf.open(io.BytesIO(data)):
            return data  # opens fine with no password -- not encrypted, return the original bytes untouched
    except pikepdf.PasswordError:
        pass
    except Exception:
        return data  # not a valid/encrypted PDF at all -- let the actual tool raise a clearer error

    if not password:
        raise EncryptedPdfError(name)

    try:
        with pikepdf.open(io.BytesIO(data), password=password) as pdf:
            output = io.BytesIO()
            pdf.save(output)
            return output.getvalue()
    except pikepdf.PasswordError as exc:
        raise EncryptedPdfError(name, wrong_password=True) from exc
