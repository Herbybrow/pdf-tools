import ocrmypdf

from app.core.config import settings
from app.core.engines import find_ghostscript
from app.core.subprocess_utils import run_cli
from app.core.tempfiles import temp_workspace

_GS_QUALITY_PROFILES = {
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
}

# Ghostscript's canned PDFSETTINGS presets are a reasonable starting point but are
# noticeably conservative about how hard they downsample/recompress images -- explicit
# resolution + JPEG-quality overrides on top of each preset get materially smaller output
# at each tier (this is what "smallest size" still being large usually comes down to:
# the canned /screen preset alone leaves real headroom on the table for image-heavy PDFs).
_RESOLUTION_DPI = {"screen": 72, "ebook": 150, "printer": 300}
_JPEG_QUALITY = {"screen": 40, "ebook": 60, "printer": 85}


def compress_pdf(data: bytes, level: str = "ebook") -> bytes:
    profile = _GS_QUALITY_PROFILES.get(level, "/ebook")
    dpi = _RESOLUTION_DPI.get(level, 150)
    jpeg_quality = _JPEG_QUALITY.get(level, 60)
    gs_path = find_ghostscript()
    if not gs_path:
        raise RuntimeError("Ghostscript is not installed.")
    with temp_workspace() as workspace:
        input_path = workspace / "input.pdf"
        output_path = workspace / "output.pdf"
        input_path.write_bytes(data)
        run_cli(
            [
                gs_path,
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.5",
                f"-dPDFSETTINGS={profile}",
                "-dNOPAUSE",
                "-dBATCH",
                "-dQUIET",
                "-dDetectDuplicateImages=true",
                "-dCompressFonts=true",
                "-dSubsetFonts=true",
                "-dDownsampleColorImages=true",
                "-dDownsampleGrayImages=true",
                "-dDownsampleMonoImages=true",
                "-dColorImageDownsampleType=/Bicubic",
                "-dGrayImageDownsampleType=/Bicubic",
                f"-dColorImageResolution={dpi}",
                f"-dGrayImageResolution={dpi}",
                f"-dMonoImageResolution={dpi}",
                "-dAutoFilterColorImages=false",
                "-dAutoFilterGrayImages=false",
                "-dColorImageFilter=/DCTEncode",
                "-dGrayImageFilter=/DCTEncode",
                f"-dJPEGQ={jpeg_quality}",
                f"-sOutputFile={output_path}",
                str(input_path),
            ],
        )
        if not output_path.exists():
            raise RuntimeError("Ghostscript did not produce an output file.")
        return output_path.read_bytes()


def repair_pdf(data: bytes) -> bytes:
    """Rebuilds a damaged PDF's xref table / object tree by round-tripping it through
    Ghostscript's PDF interpreter and re-writing it with pdfwrite, which discards
    unreadable/corrupt structures and regenerates clean ones."""
    gs_path = find_ghostscript()
    if not gs_path:
        raise RuntimeError("Ghostscript is not installed.")
    with temp_workspace() as workspace:
        input_path = workspace / "input.pdf"
        output_path = workspace / "output.pdf"
        input_path.write_bytes(data)
        run_cli(
            [
                gs_path,
                "-o",
                str(output_path),
                "-dPDFSETTINGS=/prepress",
                "-dNOPAUSE",
                "-dBATCH",
                "-dQUIET",
                "-sDEVICE=pdfwrite",
                str(input_path),
            ],
        )
        if not output_path.exists():
            raise RuntimeError("Ghostscript could not repair this PDF.")
        return output_path.read_bytes()


def ocr_pdf(data: bytes, language: str = "eng") -> bytes:
    with temp_workspace() as workspace:
        input_path = workspace / "input.pdf"
        output_path = workspace / "output.pdf"
        input_path.write_bytes(data)
        try:
            ocrmypdf.ocr(
                input_path,
                output_path,
                language=language.split("+"),
                output_type="pdfa",
                skip_text=True,
                deskew=True,
                progress_bar=False,
                tesseract_timeout=settings.engine_timeout_seconds,
            )
        except ocrmypdf.exceptions.InputFileError as exc:
            raise ValueError(f"OCR could not read this file: {exc}") from exc
        if not output_path.exists():
            raise RuntimeError("OCR did not produce an output file.")
        return output_path.read_bytes()
