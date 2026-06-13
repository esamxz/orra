// ---------------------------------------------------------------------------
// Direct R2 upload helper
// ---------------------------------------------------------------------------
// Uploads a file to a presigned R2 URL using a plain fetch.
// Does NOT send the Orra API Authorization header to R2.
// Only sends the signed headers returned by the backend.

export interface UploadInstruction {
  url: string;
  headers: Record<string, string>;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Upload a File directly to a presigned R2 URL.
 *
 * @param file   The file to upload.
 * @param upload The upload instruction from the backend intent endpoint.
 * @param signal Optional AbortController signal.
 * @throws UploadError if the R2 response is not OK.
 */
export async function uploadFileToSignedUrl(
  file: File,
  upload: UploadInstruction,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers();

  // Apply every header returned by the backend exactly as-is.
  // This typically includes Content-Type and any signed headers.
  for (const [key, value] of Object.entries(upload.headers)) {
    headers.set(key, value);
  }

  // Ensure Content-Type is present; fallback to the File's own type.
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', file.type);
  }

  let response: Response;
  try {
    response = await fetch(upload.url, {
      method: 'PUT',
      headers,
      body: file,
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UploadError('Upload cancelled');
    }
    throw new UploadError('Network error during upload');
  }

  if (!response.ok) {
    throw new UploadError(
      `Upload failed with status ${response.status}`,
      response.status,
    );
  }
}
