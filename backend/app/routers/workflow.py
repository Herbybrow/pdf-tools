import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response
from app.core.validation import validate_pdf_upload
from app.services import workflow_service

router = APIRouter()


@router.post("/execute")
async def execute(files: list[UploadFile] = File(...), pipeline: str = Form(...), password: str | None = Form(None)):
    contents = []
    for f in files:
        data = await f.read()
        validate_pdf_upload(data, f.filename)
        contents.append(decrypt_if_needed(data, password, f.filename))
    try:
        parsed = json.loads(pipeline)
        steps = parsed["pipeline"] if isinstance(parsed, dict) and "pipeline" in parsed else parsed
        if not isinstance(steps, list):
            raise ValueError("Pipeline must be a list of steps (or an object with a 'pipeline' list).")
        output = await run_in_threadpool(workflow_service.execute_pipeline, contents, steps)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid pipeline JSON: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Workflow failed: {exc}") from exc
    return file_response(output, "workflow_result.pdf", "application/pdf")
