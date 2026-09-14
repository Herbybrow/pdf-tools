import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def make_pdf(num_pages: int, label: str) -> bytes:
    doc = pymupdf.open()
    for i in range(num_pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"{label} - Page {i + 1}", fontsize=24)
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture
def pdf_a() -> bytes:
    return make_pdf(5, "Document A")


@pytest.fixture
def pdf_b() -> bytes:
    return make_pdf(3, "Document B")
