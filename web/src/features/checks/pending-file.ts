"use client";

/**
 * A file dropped outside the new-check form (e.g. on the home page) waits here while the app
 * navigates to the form, which takes it on mount. Client-side navigation keeps module state.
 */
let pending: File | null = null;

export function setPendingFile(file: File) {
  pending = file;
}

export function peekPendingFile(): File | null {
  return pending;
}

export function clearPendingFile() {
  pending = null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mpeg: "video/mpeg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
};

/** The file's media type; browsers leave it empty for some formats, so fall back to the extension. */
export function mimeOf(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type === "audio/x-m4a" ? "audio/mp4" : file.type;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "";
}
