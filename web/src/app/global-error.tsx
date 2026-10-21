"use client";

/** Last resort when the root layout itself fails: no providers, so plain bilingual markup. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F4F1EA", color: "#0E1230", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>حدث خطأ غير متوقع · Something went wrong</h1>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#3355FF", color: "#fff", cursor: "pointer" }}>
            إعادة المحاولة · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
