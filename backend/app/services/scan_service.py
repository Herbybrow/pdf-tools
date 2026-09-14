import cv2
import numpy as np


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Orders 4 points as [top-left, top-right, bottom-right, bottom-left]."""
    rect = np.zeros((4, 2), dtype="float32")
    total = pts.sum(axis=1)
    rect[0] = pts[np.argmin(total)]
    rect[2] = pts[np.argmax(total)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def detect_document_corners(image_bytes: bytes) -> list[dict[str, float]] | None:
    """Detects the largest quadrilateral (presumed document boundary) in a captured
    photo via classic edge-and-contour detection (grayscale -> blur -> Canny ->
    contours -> largest 4-point polygon). Returns 4 corners [TL, TR, BR, BL] in the
    original image's pixel coordinates, or None if no confident quadrilateral was
    found -- the frontend falls back to a manual default corner placement in that case
    (this is a real OpenCV pipeline, not a fake heuristic, but like any classic
    edge-detection approach it can still miss low-contrast edges (e.g. a white page on
    a white table) -- manual corner-drag adjustment stays available either way).
    """
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return None

    height, width = image.shape[:2]
    image_area = width * height
    if image_area == 0:
        return None

    scale = min(1.0, 1000 / max(height, width))
    small = cv2.resize(image, (int(width * scale), int(height * scale))) if scale < 1.0 else image

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest_first = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

    for contour in largest_first:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4:
            continue
        scaled_area = cv2.contourArea(approx) / (scale * scale)
        if scaled_area < image_area * 0.15:
            continue  # too small to plausibly be the whole document
        points = approx.reshape(4, 2).astype("float32") / scale
        ordered = _order_points(points)
        return [{"x": float(x), "y": float(y)} for x, y in ordered]

    return None
