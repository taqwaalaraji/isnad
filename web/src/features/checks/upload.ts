"use client";

/** PUT a file to a Supabase signed upload URL with progress (fetch has no upload progress). */
export function uploadWithProgress(signedUrl: string, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (key) xhr.setRequestHeader("apikey", key);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}
