const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Thrown when the backend reports the uploaded PDF is password-protected (HTTP 422,
 * {encrypted: true}). Callers catch this specifically to show a password prompt and
 * retry the same request with a `password` field appended, rather than showing a
 * generic error. */
export class EncryptedPdfRequiredError extends ApiError {
  wrongPassword: boolean;
  constructor(message: string, wrongPassword: boolean) {
    super(message, 422);
    this.wrongPassword = wrongPassword;
  }
}

export type ApiFileResult = {
  blob: Blob;
  filename: string;
};

function extractFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) {
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    if (match?.[1]) return match[1];
  }
  return fallback;
}

async function readErrorBody(response: Response): Promise<{ detail: string; encrypted?: boolean; wrongPassword?: boolean }> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const body = await response.json();
    return {
      detail: typeof body?.detail === "string" ? body.detail : fallback,
      encrypted: body?.encrypted === true,
      wrongPassword: body?.wrongPassword === true,
    };
  } catch {
    return { detail: fallback };
  }
}

async function throwForFailedResponse(response: Response): Promise<never> {
  const body = await readErrorBody(response);
  if (response.status === 422 && body.encrypted) {
    throw new EncryptedPdfRequiredError(body.detail, body.wrongPassword ?? false);
  }
  throw new ApiError(body.detail, response.status);
}

export async function postForFile(
  endpoint: string,
  formData: FormData,
  fallbackFilename: string,
): Promise<ApiFileResult> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: "POST", body: formData });
  if (!response.ok) {
    await throwForFailedResponse(response);
  }
  const blob = await response.blob();
  return { blob, filename: extractFilename(response, fallbackFilename) };
}

export async function postForJson<T>(endpoint: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: "POST", body: formData });
  if (!response.ok) {
    await throwForFailedResponse(response);
  }
  return response.json() as Promise<T>;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function apiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint}`;
}
