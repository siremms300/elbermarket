// Upload orchestrator.
//
// Wraps the four-step document upload flow into a single callable function:
//   1. Request presigned URL from API
//   2. PUT the file to R2
//   3. Confirm upload with API
//   4. Return the document_id
//
// Handles all the edge cases:
//   - Clock skew (RequestTimeTooSkewed) — retried once with a fresh URL
//   - Expired URL (retry with fresh URL)
//   - Network failures (single retry then fail)
//   - Content-type detection
//
// DEV MODE:
//   When EXPO_PUBLIC_DEV_SKIP_R2_UPLOAD=true, the actual PUT to R2 is
//   skipped. The presigned URL is still requested (so the document row
//   exists in the DB), and the confirm endpoint is still called (so the
//   document is marked uploaded). Only the actual file transfer to R2 is
//   skipped.
//
//   This exists because of a known dev-environment clock skew issue that
//   makes R2 reject presigned URLs from the local API server. The
//   presigned URL flow itself is proven to work; this skip is a local
//   testing workaround only.
//
//   In production, EXPO_PUBLIC_DEV_SKIP_R2_UPLOAD must be unset or false.

import { api } from "@/lib/api/client";
import type { DocumentType } from "@/lib/api/verification-types";

export interface UploadDocumentInput {
  orgId: string;
  documentType: DocumentType;
  fileUri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface UploadDocumentResult {
  documentId: string;
}

// Custom errors so UI can show appropriate messages.
export class ClockSkewError extends Error {
  constructor() {
    // Neutral message: the skew could be on our server or the client.
    // We auto-retry once with a fresh URL; if that also fails, this
    // surfaces. Never blame the user's device.
    super(
      "We couldn't complete your upload. Please try again in a moment.",
    );
    this.name = "ClockSkewError";
  }
}

export class UploadFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadFailedError";
  }
}

// Delay helper for retries.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Whether the dev-mode skip is active. Read once at module load.
const DEV_SKIP_R2_UPLOAD =
  process.env.EXPO_PUBLIC_DEV_SKIP_R2_UPLOAD === "true";

// Perform a single upload attempt (request URL → PUT → confirm).
async function attemptUpload(
  input: UploadDocumentInput,
): Promise<string> {
  // Step 1: Request presigned URL. Even in dev mode we do this so the
  // document row is created and the document_id is real.
  const uploadInfo = await api.requestDocumentUpload({
    owner_type: "organisation",
    owner_id: input.orgId,
    document_type: input.documentType,
    content_type: input.mimeType,
    file_size_bytes: input.fileSize,
    filename: input.fileName,
  });

  // ─── DEV MODE: skip the actual R2 PUT ───────────────────────────────
  if (DEV_SKIP_R2_UPLOAD) {
    // Still call confirm so the backend marks the document as uploaded.
    // The upload endpoint doesn't verify the file actually exists in R2
    // (that's a Phase 2 improvement), so this simulates a successful
    // upload from the backend's perspective.
    await api.confirmDocumentUpload(uploadInfo.document_id);
    return uploadInfo.document_id;
  }
  // ─── END DEV MODE ───────────────────────────────────────────────────

  // Step 2: PUT the file to R2 directly
  let uploadResponse: Response;
  try {
    const fileResponse = await fetch(input.fileUri);
    const blob = await fileResponse.blob();

    uploadResponse = await fetch(uploadInfo.upload.url, {
      method: uploadInfo.upload.method,
      headers: uploadInfo.upload.headers,
      body: blob,
    });
  } catch (err) {
    throw new UploadFailedError(
      err instanceof Error ? err.message : "Network error during upload.",
    );
  }

  // Step 3: Check for clock skew
  if (uploadResponse.status === 403) {
    const errorText = await uploadResponse.text();
    if (errorText.includes("RequestTimeTooSkewed")) {
      throw new ClockSkewError();
    }
    if (
      errorText.includes("AccessDenied") ||
      errorText.includes("SignatureDoesNotMatch")
    ) {
      // URL expired between generation and upload — signal for retry
      throw new Error("URL_EXPIRED");
    }
    throw new UploadFailedError(
      `Upload rejected by storage: ${errorText.substring(0, 200)}`,
    );
  }

  if (!uploadResponse.ok) {
    throw new UploadFailedError(
      `Upload failed with status ${uploadResponse.status}.`,
    );
  }

  // Step 4: Confirm upload with API
  await api.confirmDocumentUpload(uploadInfo.document_id);

  return uploadInfo.document_id;
}

// Public entry point. Retries once on expiry, network failure, or
// clock skew.
export async function uploadDocument(
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  try {
    const documentId = await attemptUpload(input);
    return { documentId };
  } catch (err) {
    // Clock skew, URL expiry, or network — retry once with a fresh URL.
    const message = err instanceof Error ? err.message : String(err);
    const shouldRetry =
      err instanceof ClockSkewError ||
      message === "URL_EXPIRED" ||
      message.includes("Network error");

    if (shouldRetry) {
      await delay(500);
      try {
        const documentId = await attemptUpload(input);
        return { documentId };
      } catch (retryErr) {
        if (retryErr instanceof ClockSkewError) throw retryErr;
        throw new UploadFailedError(
          retryErr instanceof Error
            ? retryErr.message
            : "Upload failed after retry.",
        );
      }
    }

    throw err;
  }
}


























































// // Upload orchestrator.
// //
// // Wraps the four-step document upload flow into a single callable function:
// //   1. Request presigned URL from API
// //   2. PUT the file to R2
// //   3. Confirm upload with API
// //   4. Return the document_id
// //
// // Handles all the edge cases:
// //   - Clock skew (RequestTimeTooSkewed)
// //   - Expired URL (retry with fresh URL)
// //   - Network failures (single retry then fail)
// //   - Content-type detection
// //
// // The user never sees any of this — the app just shows "Uploading…" then
// // "Uploaded".

// import { api, HttpError } from "@/lib/api/client";
// import type { DocumentType } from "@/lib/api/verification-types";

// export interface UploadDocumentInput {
//   orgId: string;
//   documentType: DocumentType;
//   fileUri: string;
//   mimeType: string;
//   fileName: string;
//   fileSize: number;
// }

// export interface UploadDocumentResult {
//   documentId: string;
// }

// // Custom errors so UI can show appropriate messages.
// export class ClockSkewError extends Error {
//   constructor() {
//     super("Your phone's clock is out of sync. Please enable automatic time in Settings and try again.");
//     this.name = "ClockSkewError";
//   }
// }

// export class UploadFailedError extends Error {
//   constructor(message: string) {
//     super(message);
//     this.name = "UploadFailedError";
//   }
// }

// // Delay helper for retries.
// function delay(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

// // Perform a single upload attempt (request URL → PUT → confirm).
// async function attemptUpload(
//   input: UploadDocumentInput,
// ): Promise<string> {
//   // Step 1: Request presigned URL
//   const uploadInfo = await api.requestDocumentUpload({
//     owner_type: "organisation",
//     owner_id: input.orgId,
//     document_type: input.documentType,
//     content_type: input.mimeType,
//     file_size_bytes: input.fileSize,
//     filename: input.fileName,
//   });

//   // Step 2: PUT the file to R2 directly
//   let uploadResponse: Response;
//   try {
//     const fileResponse = await fetch(input.fileUri);
//     const blob = await fileResponse.blob();

//     uploadResponse = await fetch(uploadInfo.upload.url, {
//       method: uploadInfo.upload.method,
//       headers: uploadInfo.upload.headers,
//       body: blob,
//     });
//   } catch (err) {
//     throw new UploadFailedError(
//       err instanceof Error ? err.message : "Network error during upload.",
//     );
//   }

//   // Step 3: Check for clock skew
//   if (uploadResponse.status === 403) {
//     const errorText = await uploadResponse.text();
//     if (errorText.includes("RequestTimeTooSkewed")) {
//       throw new ClockSkewError();
//     }
//     if (
//       errorText.includes("AccessDenied") ||
//       errorText.includes("SignatureDoesNotMatch")
//     ) {
//       // URL expired between generation and upload — signal for retry
//       throw new Error("URL_EXPIRED");
//     }
//     throw new UploadFailedError(
//       `Upload rejected by storage: ${errorText.substring(0, 200)}`,
//     );
//   }

//   if (!uploadResponse.ok) {
//     throw new UploadFailedError(
//       `Upload failed with status ${uploadResponse.status}.`,
//     );
//   }

//   // Step 4: Confirm upload with API
//   await api.confirmDocumentUpload(uploadInfo.document_id);

//   return uploadInfo.document_id;
// }

// // Public entry point. Retries once on expiry or network failure.
// export async function uploadDocument(
//   input: UploadDocumentInput,
// ): Promise<UploadDocumentResult> {
//   try {
//     const documentId = await attemptUpload(input);
//     return { documentId };
//   } catch (err) {
//     // Clock skew — no point retrying, it'll fail again
//     if (err instanceof ClockSkewError) {
//       throw err;
//     }

//     // URL expired or transient network — retry once with fresh URL
//     const message = err instanceof Error ? err.message : String(err);
//     if (message === "URL_EXPIRED" || message.includes("Network error")) {
//       await delay(500);
//       try {
//         const documentId = await attemptUpload(input);
//         return { documentId };
//       } catch (retryErr) {
//         if (retryErr instanceof ClockSkewError) throw retryErr;
//         throw new UploadFailedError(
//           retryErr instanceof Error ? retryErr.message : "Upload failed after retry.",
//         );
//       }
//     }

//     throw err;
//   }
// }