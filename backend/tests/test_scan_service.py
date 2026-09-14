import io

from PIL import Image, ImageDraw

from app.services.scan_service import detect_document_corners


def _make_synthetic_document_photo() -> bytes:
    """A white 'document' rectangle on a dark background -- enough contrast for Canny
    edge detection to find a clean 4-point contour."""
    img = Image.new("RGB", (800, 600), color=(40, 40, 40))
    draw = ImageDraw.Draw(img)
    draw.rectangle([150, 100, 650, 500], fill=(255, 255, 255))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()


def test_detect_document_corners_finds_high_contrast_rectangle():
    corners = detect_document_corners(_make_synthetic_document_photo())
    assert corners is not None
    assert len(corners) == 4

    xs = [c["x"] for c in corners]
    ys = [c["y"] for c in corners]
    assert min(xs) < 170
    assert max(xs) > 630
    assert min(ys) < 120
    assert max(ys) > 480

    # Ordered [TL, TR, BR, BL]: top-left has the smallest x+y.
    top_left = corners[0]
    assert top_left["x"] < 300
    assert top_left["y"] < 200


def test_detect_document_corners_returns_none_for_blank_uniform_image():
    img = Image.new("RGB", (400, 300), color=(200, 200, 200))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    assert detect_document_corners(buffer.getvalue()) is None


def test_detect_document_corners_handles_garbage_input_gracefully():
    assert detect_document_corners(b"not an image") is None
