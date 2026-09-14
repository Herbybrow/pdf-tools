# NSSF PDF Tools

A self-hosted, internal PDF processing suite for NSSF Tanzania: merge, split, compress, convert, edit, secure, and automate PDF workflows — no external APIs, no usage limits, no AI features (excluded by design). Runs entirely on your own machine/network; nothing leaves the building.

## Architecture

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind 4) — `src/`
- **Backend**: FastAPI (Python) — `backend/app/`, one router + service module per feature area (organize, optimize, convert-to, convert-from, edit, security, workflow)
- **Processing engines**: PyMuPDF (the workhorse for most PDF manipulation, including genuine redaction), Ghostscript (compress/repair/PDF-A), Tesseract + ocrmypdf (OCR), LibreOffice headless (Office→PDF), Playwright (HTML→PDF), pikepdf (encryption/decryption), OpenCV (automatic document-edge detection for Scan to PDF); Sign PDF and Edit PDF's signature/annotation baking run entirely client-side (`pdf-lib`), no backend engine involved
- **Only the frontend is intended for Vercel.** The backend needs LibreOffice/Ghostscript/Tesseract and long-running subprocess calls that don't fit a serverless function — it stays self-hosted (this PC today, an NSSF server later). Point `NEXT_PUBLIC_API_BASE_URL` at wherever it ends up.
- **Local-first security posture**: both dev servers bind to `127.0.0.1` only (never `0.0.0.0`), CORS is restricted to the local frontend origin by default, and every generated PDF has its metadata (author/creator/paths/EXIF-style XMP) stripped before it's returned. See [Local security](#local-security) below.

## First-time setup

**Prerequisites**: Node.js 18+, Python 3.11+ (this was built and tested on Python 3.14), Windows with `winget` available.

```powershell
# 1. Frontend
npm install                 # also copies the PDF.js worker into public/ via postinstall

# 2. Backend
cd backend
powershell -ExecutionPolicy Bypass -File scripts\install-deps.ps1
cd ..
```

`install-deps.ps1` installs LibreOffice and Tesseract via winget, downloads and installs Ghostscript directly (it isn't reliably available via winget), fetches the Kiswahili/French/orientation-detection OCR language packs into a project-local `backend/tessdata/` (winget's Tesseract package only bundles English, and admin rights aren't needed to write here, unlike its own install directory), creates the Python venv, installs `requirements.txt`, installs Playwright's Chromium, and generates a local demo signing certificate. It's safe to re-run; it skips anything already installed.

**Running locally** — one command from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File start-nssf-suite.ps1
```

This scans ports 3000/8000 for stale processes left over from a previous run and stops them, checks that LibreOffice/Tesseract/Ghostscript/the Python venv/`node_modules` are all present (warning, not blocking, if something's missing), then launches both servers bound to `127.0.0.1` only. Press Ctrl+C once to stop both together — it also sweeps the ports again afterward in case either framework's dev-mode reload spawned a detached child process.

Prefer two terminals instead (e.g. for separate log output while developing)? That still works:

```powershell
# Terminal 1 - backend
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 - frontend
npm run dev
```

Open http://localhost:3000. The backend's root endpoint (http://localhost:8000/) reports which engines it detected — check this first if a tool returns a "not installed" error.

## Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | frontend `.env.local` | `http://localhost:8000` | Where the frontend sends API requests |
| `CORS_ORIGINS` | backend env | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed origins; append your eventual Vercel URL here, no code change needed |
| `NSSF_HOST` | backend env | `127.0.0.1` | Interface uvicorn binds to — leave alone unless you understand the exposure implications |
| `NSSF_PORT` | backend env | `8000` | Backend port |
| `NSSF_TEMP_DIR` | backend env | `backend/tmp/nssf_proc` | Scratch directory for in-flight processing; also becomes the process's `TEMP`/`TMP` so third-party engines' own scratch files land here too |
| `NSSF_TEMP_MAX_AGE_MINUTES` | backend env | `15` | How old a leftover temp directory must be before the sweep deletes it |
| `NSSF_CLEANUP_INTERVAL_MINUTES` | backend env | `15` | How often the APScheduler sweep job runs |
| `NSSF_MAX_UPLOAD_MB` | backend env | `200` | Hard cap on request body size (rejected with 413 before any processing starts) |
| `NSSF_MAX_PAGES` | backend env | `2000` | Hard cap on input PDF page count (rejected with 422 before any processing starts) |
| `NSSF_ENGINE_TIMEOUT_SECONDS` | backend env | `300` | Max time any single CLI engine call (Ghostscript/LibreOffice/Tesseract/Playwright) may run before it's killed and a clean timeout error is returned |
| `NSSF_LIBREOFFICE_PATH` / `NSSF_TESSERACT_PATH` / `NSSF_GHOSTSCRIPT_PATH` | backend env | unset | Explicit path to that engine's executable, checked before PATH and before the Windows Program-Files fallback locations — set these if an engine is installed somewhere non-standard |
| `NSSF_LAN_HOST` | frontend `.env.local` | unset | Your computer's LAN IP, only needed for Scan to PDF's phone-scanning mode — see [Scanning from a phone](#scanning-from-a-phone) |

## Testing

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/ -v
```

72 tests cover all seven modules plus the edge-case hardening layer (guardrails, encrypted-PDF handling, the temp-dir redirect, metadata sanitizing, OpenCV corner detection, the phone-scan WebSocket relay), run against the real installed engines (not mocks) — including a full reproduction of this spec's own example workflow pipeline (merge → OCR → watermark → compress → convert to PDF/A).

Frontend checks:

```powershell
npx tsc --noEmit     # 0 errors
npm run lint         # 0 errors, 0 warnings
```

## Zero data retention

Every request processes its file(s) in an isolated temp directory (`backend/tmp/nssf_proc/<random-id>/`) that is deleted the moment the response is built, success or failure. An APScheduler job also sweeps that directory every 15 minutes as a safety net for anything left behind by a crashed or SIGKILLed request.

This is enforced at the process level, not just for our own code: at startup, `backend/app/core/config.py` redirects the process's `TEMP`/`TMP` environment variables (inherited by every subprocess) and Python's own `tempfile` module default into `NSSF_TEMP_DIR`. Ghostscript, LibreOffice, Tesseract/ocrmypdf, and Playwright all pick a scratch location via that OS-level convention rather than a path we control directly — without the redirect, their internal scratch files would silently land outside the monitored directory and never get swept. Verified two ways: an automated pytest (`test_temp_env_vars_point_at_monitored_temp_root`, `test_bare_tempfile_call_with_no_explicit_dir_lands_in_temp_root`) and live, under real load — firing compress/OCR/HTML-to-PDF requests through the actual Ghostscript/Tesseract/Playwright binaries and confirming `backend/tmp/nssf_proc/` is empty both before and after.

Encrypted (password-protected) PDFs are supported everywhere a PDF is uploaded: the backend detects encryption and returns a structured 422 the frontend recognizes, prompting the user for a password inline and retrying the same request. Decryption happens in memory only (`pikepdf`, never written to disk, never logged, never cached) — the password is used once for that request and discarded.

## Local security

- **Both servers bind to `127.0.0.1` only** — not `0.0.0.0` — so nothing on the local network can reach either the frontend or the backend. Confirmed via `netstat -ano` showing only loopback listeners. The one deliberate, opt-in exception is Scan to PDF's phone-scanning mode, which needs a phone on the same Wi-Fi to reach the app — see [Scanning from a phone](#scanning-from-a-phone).
- **CORS is restricted by default** to `http://localhost:3000` and `http://127.0.0.1:3000` (see `CORS_ORIGINS` above) — no wildcard origins.
- **PDF metadata is sanitized automatically.** Every PDF the backend returns has its standard metadata dictionary (author, creator, producer, subject, keywords) and XMP metadata cleared before it's sent — so a converted or edited file doesn't carry the original file's author name, source file path, or authoring-tool fingerprint. (Skipped only for the encrypt/protect endpoint, where rewriting metadata after encryption would corrupt the output — protected files keep whatever metadata the source had.)
- **No secrets or credentials are stored anywhere in the repo.** There are none to store: Sign PDF is a client-side visual signature tool (see below), so this app has never needed a certificate or private key.

## What's genuinely built vs. documented-but-not-built

All 32 tools in the catalog (`/tools`) are functional — none show the old "not implemented" placeholder. A few things are intentionally scoped down; each is called out where the tradeoff matters:

- **Scan to PDF**: three capture modes — this device's camera, uploading photos, or scanning a QR code to capture from a phone on the same Wi-Fi (see [Scanning from a phone](#scanning-from-a-phone) below). Document edges are auto-detected server-side (real OpenCV: grayscale → blur → Canny edge detection → contour approximation) the moment a page is captured, with the 4 corners pre-filled from that result; drag-to-adjust remains available for fine-tuning when the auto-detect guess isn't perfect (busy backgrounds, low contrast). Falls back to sensible default corners if no confident contour is found. Every captured page can also be individually edited afterward: crop, filter presets (black & white, high-contrast mono, sepia), and brightness/contrast/saturation/hue/temperature sliders, all with a live preview.
- **Merge PDF**: add two or more files and every page from all of them appears together in one grid — drag pages into whatever final order you want (across files, not just within one), delete pages you don't need, then merge. The same page-composition endpoint backs both this and Organize PDF's insert-a-second-document feature.
- **Crop PDF**: numeric margins (points from each side), not a visual drag-to-crop box.
- **PDF → Word/Excel/PowerPoint**: structural extraction via `pdf2docx`/`pdfplumber`/`python-pptx`, tuned for multi-column layouts (gutter-detection splits columns into correct reading order instead of interleaving them), ruled and borderless tables, and paragraph alignment inference — genuinely editable output, but still not a pixel-perfect reproduction of the original file's native template for complex or heavily scanned source PDFs.
- **PDF Forms**: fills and flattens *existing* fillable fields. Adding brand-new fields to a blank form (a drag-to-place field designer) is a natural follow-on, not built yet.
- **Sign PDF**: a visual signature tool matching iLovePDF's own basic flow (compared against the live site directly) — draw, type, or upload a signature image, then drag/resize/delete it anywhere on any page. Baked into the PDF entirely client-side (`pdf-lib`), the same proven approach as Edit PDF's signature pad, so the output is always a direct, un-zipped PDF. This intentionally does **not** do PKI/cryptographic signing (no audit trail, no tamper-evidence) — an earlier version did, via pyHanko, but it only produced a text stamp ("Signed by: X") instead of an actual signature and forced a zip download for a separate audit-trail PDF nobody asked for. If NSSF later needs legally-binding, tamper-evident signatures, that's a real PKI integration (a proper org certificate, not a demo one) and is a different, bigger feature than this tool.
- **Kiswahili translations**: full coverage — header nav, filter pills, shared upload/result UI, and every tool's own labels, help text, placeholders, submit buttons, and validation/error messages across all 32 tools (toggle EN/SW in the top bar). The Kiswahili strings should still get a native-speaker review pass before wide rollout, since they were written rather than sourced from an NSSF-approved glossary.

**Documented, not built** — each needs credentials or infrastructure only NSSF can provide:
- **Google Drive / Dropbox sync**: needs OAuth app registration (client ID/secret) with each provider.
- **SMB/NFS network share integration**: needs the actual share paths/credentials for NSSF's internal network.
- **Docker packaging**: not needed to run locally; worth adding once there's a real deployment target (a container needs LibreOffice/Ghostscript/Tesseract baked in, which makes for a large image — plan for that).
- **Production PKI certificate / legally-binding e-signatures**: see Sign PDF above — deliberately out of scope for the current visual-signature tool.

## Scanning from a phone

Scan to PDF's "Scan from your phone" mode shows a QR code; scanning it with a phone on the same Wi-Fi opens a lightweight capture page there, and each photo taken appears on the desktop automatically (via a WebSocket relay) for the same corner-adjustment step as a local capture. Nothing is written to disk for this — a session is a few in-memory photo bytes relayed live, purged by the same periodic sweep that cleans up temp files if a session is ever abandoned mid-scan.

**This requires an explicit, temporary opt-out of the local-only security posture above**, because a phone is a different physical device and genuinely cannot reach anything bound to `127.0.0.1`. There's no way around that — it's not a bug to be fixed, it's what "bind to loopback only" means. To use it:

1. Find your computer's LAN IP (Windows: `ipconfig`, look for "IPv4 Address" under your Wi-Fi/Ethernet adapter — something like `192.168.1.4`).
2. Add `NSSF_LAN_HOST=<that IP>` to `backend/.env` and to a `.env.local` at the repo root (Next.js loads `.env.local` automatically) — this is what allows the phone's browser to load the app's dev assets at all ([`allowedDevOrigins`](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins), a Next.js 16 security feature that blocks cross-origin dev requests by default).
3. Start the backend with `NSSF_HOST=0.0.0.0` and `CORS_ORIGINS` including `http://<that IP>:3000`, and the frontend with `npm run dev:lan` instead of `npm run dev`.
4. On the *desktop*, open the app via `http://<that IP>:3000` — not `localhost`. The app checks for this and shows a warning with instructions if you forget; the QR code embeds whatever address you're viewing the page from, so a QR code built from `localhost` would be useless to a phone.

Revert to the plain `npm run dev` / default `NSSF_HOST` afterward for normal use — there's no reason to stay LAN-exposed once you're done scanning from a phone.

One more real constraint worth knowing: `<input capture="environment">` (the mechanism that opens the phone's native camera app) works over plain HTTP because it doesn't go through the browser's stricter WebRTC camera permission system — but a handful of *other* browser APIs (`crypto.randomUUID()`, `navigator.mediaDevices.getUserMedia`) are still gated to HTTPS/localhost regardless. This app works around the former (a `Math.random()`-based id fallback) where it's needed for phone-pairing to work at all; the latter means the *desktop's own* "Start camera" button won't work while you're viewing the page via a LAN IP for phone-scan purposes — expected, since if you wanted the desktop's own camera you wouldn't be in phone-scan mode.

## Scaling note

The backend runs as a single Uvicorn worker on purpose: the in-process APScheduler cleanup job assumes it's the only one touching `backend/tmp/`. A future multi-worker or multi-server deployment should move that sweep to an external scheduled task instead of enabling `--workers N` as-is.

## Project structure

```
start-nssf-suite.ps1   # unified local launcher: stale-port cleanup, prereq check, both servers, synchronized teardown
backend/
  app/
    core/       # config (incl. TEMP/TMP redirect), engine detection (Windows path fallbacks), temp workspace,
                # page-range parsing, pdf_crypto (encrypted-PDF decrypt), pdf_sanitize (metadata stripping),
                # validation (upload/page-count guardrails), middleware (max body size),
                # scan_sessions (phone-scan WebSocket pairing, in-memory, TTL-swept)
    routers/    # one per module, thin HTTP layer
    services/   # the actual PDF logic, unit-testable without HTTP
  tests/        # pytest, one file per module plus test_guardrails.py for the hardening layer
  scripts/      # install-deps.ps1
src/
  app/tools/[slug]/page.tsx   # looks up each tool: generic config-driven page, a bespoke component, or (for anything not yet wired) a "coming soon" fallback
  app/scan-mobile/page.tsx     # lightweight phone capture page for Scan to PDF's QR mode -- not part of the /tools catalog
  components/tools/            # FileDropzone, ToolOptionsForm, ToolResultPanel, GenericToolPage, WorkspaceToolPage (dual-pane live-preview layout,
                                # the default for tools with a file upload), PasswordPromptModal, PreviewModal, ScanPageEditor
  lib/useToolSubmission.ts     # shared submit/retry/reset state behind both GenericToolPage and WorkspaceToolPage
  components/tools/bespoke/    # the tools that need real custom UI (visual reorder, merge arranger, canvas editor, scan capture, sign, redaction, compare, workflow builder)
  lib/toolDefinitions.ts       # the config driving every generic tool page (English + Kiswahili copy)
  lib/workflowSteps.ts         # the step vocabulary for the workflow pipeline builder
  lib/i18n/                    # English/Kiswahili translations (full tool-copy coverage)
  lib/uuid.ts                  # id generation with a fallback for contexts where crypto.randomUUID() isn't available
```
