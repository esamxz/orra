import { useState, useCallback, useRef } from 'react';
import {
  createProjectAssetUploadIntent,
  confirmProjectAssetUpload,
  createBrandAssetUploadIntent,
  confirmBrandAssetUpload,
} from '../api/assets.js';
import { uploadFileToSignedUrl } from '../uploads/uploadFileToSignedUrl.js';
import { ApiClientError } from '../api/errors.js';
import type { AssetDto, UploadIntentResponse } from '../api/types.js';

// ---------------------------------------------------------------------------
// useAssetUpload hook
// ---------------------------------------------------------------------------
// Manages the full upload flow: validate → intent → PUT → confirm.
// Supports both project and brand asset contexts.

export type UploadStatus =
  | 'idle'
  | 'requesting_intent'
  | 'uploading'
  | 'confirming'
  | 'succeeded'
  | 'failed';

export interface UseAssetUploadResult {
  status: UploadStatus;
  error: string | null;
  asset: AssetDto | null;
  upload: (file: File, context: UploadContext) => Promise<AssetDto | null>;
  reset: () => void;
}

export type UploadContext =
  | { type: 'project'; projectId: string; kind: 'upload' | 'reference' }
  | { type: 'brand'; brandSystemId: string; kind: 'logo' | 'reference' };

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function validateFile(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return 'Unsupported file type. Please use PNG, JPEG, or WebP.';
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return 'File is too large. Maximum size is 10 MB.';
  }
  return null;
}

export function useAssetUpload(): UseAssetUploadResult {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetDto | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus('idle');
    setError(null);
    setAsset(null);
  }, []);

  const upload = useCallback(async (file: File, context: UploadContext): Promise<AssetDto | null> => {
    // Reset any previous state
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abortController = new AbortController();
    abortRef.current = abortController;

    setStatus('idle');
    setError(null);
    setAsset(null);

    // Step 1: client-side validation
    const validationError = validateFile(file);
    if (validationError) {
      setStatus('failed');
      setError(validationError);
      return null;
    }

    // Step 2: request upload intent
    setStatus('requesting_intent');
    let intent: UploadIntentResponse;
    try {
      const input = {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        kind: context.kind,
      };
      if (context.type === 'project') {
        intent = await createProjectAssetUploadIntent(context.projectId, input);
      } else {
        intent = await createBrandAssetUploadIntent(context.brandSystemId, input);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError
        ? err.message
        : 'Failed to request upload. Please try again.';
      setStatus('failed');
      setError(msg);
      return null;
    }

    // Step 3: PUT file to R2
    setStatus('uploading');
    try {
      await uploadFileToSignedUrl(file, intent.upload, abortController.signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload to storage failed. Please try again.';
      setStatus('failed');
      setError(msg);
      return null;
    }

    // Step 4: confirm upload with backend
    setStatus('confirming');
    try {
      const confirmInput = {
        expectedSizeBytes: file.size,
        expectedContentType: file.type,
      };
      const confirmed =
        context.type === 'project'
          ? await confirmProjectAssetUpload(context.projectId, intent.asset.id, confirmInput)
          : await confirmBrandAssetUpload(context.brandSystemId, intent.asset.id, confirmInput);
      setStatus('succeeded');
      setAsset(confirmed);
      return confirmed;
    } catch (err) {
      const msg = err instanceof ApiClientError
        ? err.message
        : 'Upload could not be confirmed. Please try again.';
      setStatus('failed');
      setError(msg);
      return null;
    }
  }, []);

  return { status, error, asset, upload, reset };
}
