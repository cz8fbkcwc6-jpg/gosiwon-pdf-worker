/**
 * Build a single HTML document for the signed contract. Uses Noto Sans KR from Google Fonts for Korean.
 * Long terms and signature images are supported via normal HTML/CSS.
 */
function escapeHtml(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {{
 *   version: number;
 *   signedAt: string;
 *   ownerFields: Record<string, string>;
 *   residentFields: Record<string, string>;
 *   terms: string;
 *   ownerSignatureUrl?: string;
 *   residentSignatureUrl?: string;
 * }} payload
 * @returns {string} HTML string
 */
export function buildHtml(payload) {
  const {
    version,
    signedAt,
    ownerFields = {},
    residentFields = {},
    terms = "",
    ownerSignatureUrl,
    residentSignatureUrl,
  } = payload;

  const ownerRows = Object.entries(ownerFields)
    .map(([k, v]) => `<tr><td class="label">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  const residentRows = Object.entries(residentFields)
    .map(([k, v]) => `<tr><td class="label">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");

  const termsHtml = escapeHtml(terms || "-").replace(/\n/g, "<br>");

  const ownerSigHtml = ownerSignatureUrl
    ? `<img src="${escapeHtml(ownerSignatureUrl)}" alt="Owner signature" class="sig-img" />`
    : "";
  const residentSigHtml = residentSignatureUrl
    ? `<img src="${escapeHtml(residentSignatureUrl)}" alt="Resident signature" class="sig-img" />`
    : "";

  const signedAtStr = signedAt ? new Date(signedAt).toISOString() : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #111;
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm;
    }
    h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px 0; }
    h2 { font-size: 12px; font-weight: 700; margin: 16px 0 6px 0; }
    .meta { font-size: 10px; color: #444; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .label { font-weight: 700; width: 120px; vertical-align: top; padding: 2px 8px 2px 0; }
    td { padding: 2px 0; }
    .terms { white-space: pre-wrap; word-break: break-word; margin: 8px 0; }
    .signatures { margin-top: 24px; display: flex; gap: 24px; flex-wrap: wrap; }
    .sig-img { max-width: 120px; max-height: 80px; object-fit: contain; }
    @media print {
      body { padding: 12mm; }
    }
  </style>
</head>
<body>
  <h1>Contract (Signed)</h1>
  <div class="meta">
    Version: ${escapeHtml(String(version))}
    ${signedAtStr ? `<br>Signed at: ${escapeHtml(signedAtStr)}` : ""}
  </div>

  <h2>Owner fields</h2>
  <table><tbody>${ownerRows || "<tr><td colspan=\"2\">—</td></tr>"}</tbody></table>

  <h2>Resident fields</h2>
  <table><tbody>${residentRows || "<tr><td colspan=\"2\">—</td></tr>"}</tbody></table>

  <h2>Terms</h2>
  <div class="terms">${termsHtml}</div>

  <div class="signatures">
    ${ownerSigHtml ? `<div>Owner signature: ${ownerSigHtml}</div>` : ""}
    ${residentSigHtml ? `<div>Resident signature: ${residentSigHtml}</div>` : ""}
  </div>
</body>
</html>`;
}
