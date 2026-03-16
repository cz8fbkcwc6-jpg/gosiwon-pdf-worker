/**
 * 입실 계약서 PDF용 HTML 생성. 한국 표준 계약서 스타일(공문서).
 * 파라미터: residentConsent (boolean[5]), hostelName, ownerName, contractId 등.
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

function fontFaceCss(fontEmbed) {
  if (!fontEmbed?.base64 || !fontEmbed?.mime) return "";
  const format = fontEmbed.mime.includes("woff2") ? "woff2" : fontEmbed.mime.includes("ttf") ? "truetype" : "opentype";
  return `
    @font-face {
      font-family: 'Noto Sans KR';
      font-style: normal;
      font-weight: 400 700;
      font-display: block;
      src: url(data:${fontEmbed.mime};base64,${fontEmbed.base64}) format('${format}');
    }
  `;
}

/** ISO 날짜를 한국식 읽기 쉬운 날짜·시간으로 변환 */
function formatSignedAtKo(iso) {
  if (!iso || typeof iso !== "string") return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** 서명일시 → 날짜만 한국식 (계약 체결일용) */
function formatSignedAtDateOnly(iso) {
  if (!iso || typeof iso !== "string") return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

/** 금액 필드: 숫자 추출 후 toLocaleString('ko-KR') + '원' */
function formatCurrency(val) {
  if (val == null) return "";
  const str = String(val).trim();
  const num = Number(str.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return str;
  return num.toLocaleString("ko-KR") + "원";
}

/** YYYYMMDD → 'YYYY. MM. DD.' */
function formatDateYmd(val) {
  if (val == null || typeof val !== "string") return val == null ? "" : String(val);
  const s = String(val).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  }
  return s;
}

/** 계약 체결 동의 항목 5개 (고정 문구) */
const CONSENT_TEXTS = [
  "본 계약은 전자문서로 작성되며 서면 계약과 동일한 법적 효력이 발생함에 동의합니다.",
  "본인은 계약 내용을 충분히 확인하였으며 계약 조건을 이해하고 동의합니다.",
  "본 계약은 본인의 자유로운 의사에 따라 체결하는 것입니다.",
  "본인은 본인의 휴대전화로 수신한 인증번호를 직접 입력하여 계약 절차를 진행하였으며 타인에게 인증번호를 제공하지 않았음을 확인합니다.",
  "계약 체결 및 분쟁 대응을 위하여 필요한 범위 내에서 개인정보가 수집·보관될 수 있음에 동의합니다.",
];

const CURRENCY_KEYS = ["보증금", "월 이용료", "월이용료"];
const DATE_KEYS = ["계약 시작일", "계약 종료일"];

/**
 * @param {{
 *   version: number;
 *   signedAt: string;
 *   ownerFields: Record<string, string>;
 *   residentFields: Record<string, string>;
 *   terms: string;
 *   ownerSignatureUrl?: string;
 *   residentSignatureUrl?: string;
 *   fontEmbed?: { mime: string; base64: string } | null;
 *   residentConsent?: boolean[];
 *   residentName?: string;
 *   ipAddress?: string;
 *   deviceType?: string;
 *   hostelName?: string;
 *   ownerName?: string;
 *   contractId?: string;
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
    fontEmbed = null,
    residentConsent = [],
    residentName: payloadResidentName,
    ipAddress,
    deviceType,
    hostelName = "",
    ownerName = "",
    contractId = "",
  } = payload;

  const residentName = payloadResidentName ?? residentFields["이름"] ?? residentFields["name"] ?? "";
  const signedAtKo = formatSignedAtKo(signedAt);
  const signedAtDateOnly = formatSignedAtDateOnly(signedAt);
  const contractIdDisplay = String(contractId).slice(0, 8);

  const ownerRows = Object.entries(ownerFields)
    .map(([k, v]) => {
      let display = String(v ?? "");
      if (CURRENCY_KEYS.includes(k)) display = formatCurrency(v);
      else if (DATE_KEYS.includes(k)) display = formatDateYmd(v);
      return `<tr><td class="cell-label">${escapeHtml(k)}</td><td class="cell-value">${escapeHtml(display)}</td></tr>`;
    })
    .join("");
  const residentRows = Object.entries(residentFields)
    .map(([k, v]) => `<tr><td class="cell-label">${escapeHtml(k)}</td><td class="cell-value">${escapeHtml(String(v ?? ""))}</td></tr>`)
    .join("");

  const termsHtml = escapeHtml(terms || "-").replace(/\n/g, "<br>");

  const consentLines = CONSENT_TEXTS.map((text, i) => {
    const checked = Array.isArray(residentConsent) && residentConsent[i] === true;
    const box = checked ? "☑" : "☐";
    return `<p class="consent-item">${escapeHtml(box)} ${escapeHtml(text)}</p>`;
  }).join("");

  const ownerSigHtml = ownerSignatureUrl
    ? `<img src="${escapeHtml(ownerSignatureUrl)}" alt="원장 서명" class="sig-img" />`
    : "";
  const residentSigHtml = residentSignatureUrl
    ? `<img src="${escapeHtml(residentSignatureUrl)}" alt="입주민 서명" class="sig-img" />`
    : "";

  const partiesSection = `
  <div class="parties-section">
    <table class="table-wrap">
      <tr><td class="cell-label">임대인 (원장)</td><td class="cell-value">고시원 상호: ${escapeHtml(hostelName || "—")} / 원장: ${escapeHtml(ownerName || "—")}</td></tr>
      <tr><td class="cell-label">임차인 (입주민)</td><td class="cell-value">${escapeHtml(residentName || "—")}</td></tr>
      <tr><td class="cell-label">계약 번호</td><td class="cell-value">${escapeHtml(contractIdDisplay || "—")}</td></tr>
    </table>
  </div>`;

  const localFontCss = fontFaceCss(fontEmbed);
  const fallbackFontLink = fontEmbed
    ? ""
    : `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=block" rel="stylesheet" />`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${fallbackFontLink}
  <style>
    * { box-sizing: border-box; }
    ${localFontCss}
    body {
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 18mm 20mm;
      background: #fff;
    }
    .doc-title {
      font-size: 22pt;
      font-weight: 700;
      text-align: center;
      margin: 0 0 24px 0;
      letter-spacing: -0.5px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 12pt;
      font-weight: 700;
      margin: 0 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 2px solid #333;
    }
    .parties-section { margin-bottom: 20px; }
    .table-wrap {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #333;
      margin-bottom: 0;
    }
    .table-wrap td {
      border: 1px solid #333;
      padding: 8px 12px;
      vertical-align: top;
    }
    .cell-label {
      width: 28%;
      font-weight: 700;
      background: #f5f5f5;
    }
    .cell-value {
      width: 72%;
    }
    .terms-box {
      border: 1px solid #333;
      padding: 12px 14px;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 80px;
      background: #fafafa;
    }
    .terms-box br { display: block; content: ""; margin-top: 4px; }
    .consent-section .consent-item {
      margin: 6px 0;
      font-size: 10.5pt;
      line-height: 1.5;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      margin-top: 20px;
    }
    .signature-block {
      flex: 1;
      text-align: center;
    }
    .signature-block .sig-img {
      max-width: 140px;
      max-height: 70px;
      object-fit: contain;
      display: block;
      margin: 0 auto 6px auto;
    }
    .signature-label {
      font-size: 10pt;
      font-weight: 700;
    }
    .signature-date {
      text-align: center;
      margin-top: 16px;
      font-size: 10pt;
    }
    .proof-box {
      margin-top: 24px;
      padding: 14px 16px;
      background: #e8e8e8;
      border: 1px solid #999;
      font-size: 10pt;
    }
    .proof-box p { margin: 4px 0; }
    .proof-footer {
      margin-top: 16px;
      font-size: 9pt;
      color: #555;
      line-height: 1.5;
    }
    @media print {
      body { padding: 15mm 18mm; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1 class="doc-title">입실 계약서</h1>

  ${partiesSection}

  <section class="section">
    <h2 class="section-title">1. 계약 기본 정보</h2>
    <table class="table-wrap"><tbody>${ownerRows || "<tr><td class=\"cell-label\">—</td><td class=\"cell-value\">—</td></tr>"}</tbody></table>
  </section>

  <section class="section">
    <h2 class="section-title">2. 입주민 정보</h2>
    <table class="table-wrap"><tbody>${residentRows || "<tr><td class=\"cell-label\">—</td><td class=\"cell-value\">—</td></tr>"}</tbody></table>
  </section>

  <section class="section">
    <h2 class="section-title">3. 계약 조항</h2>
    <div class="terms-box">${termsHtml}</div>
  </section>

  <section class="section consent-section">
    <h2 class="section-title">4. 계약 체결 동의 항목</h2>
    <div class="consent-items">
      ${consentLines}
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">5. 서명란</h2>
    <div class="signature-row">
      <div class="signature-block">
        ${ownerSigHtml}
        <span class="signature-label">원장</span>
      </div>
      <div class="signature-block">
        ${residentSigHtml}
        <span class="signature-label">입주민 (서명인)</span>
      </div>
    </div>
    <p class="signature-date">계약 체결일: ${escapeHtml(signedAtDateOnly || "—")}</p>
  </section>

  <section class="section">
    <h2 class="section-title">6. 법적 효력 및 전자서명 증명</h2>
    <div class="proof-box">
      <p><strong>서명일시:</strong> ${escapeHtml(signedAtKo || "—")}</p>
      <p><strong>서명자:</strong> ${escapeHtml(residentName || "—")}</p>
      <p><strong>서명 방식:</strong> OTP 인증 기반 전자서명</p>
      <p><strong>OTP 인증 완료:</strong> 예</p>
      ${ipAddress ? `<p><strong>IP 주소:</strong> ${escapeHtml(String(ipAddress))}</p>` : ""}
      ${deviceType ? `<p><strong>기기 유형:</strong> ${escapeHtml(String(deviceType))}</p>` : ""}
      <p><strong>계약 버전:</strong> ${escapeHtml(String(version))}</p>
      <p class="proof-footer">본 계약서는 전자서명법 제2조에 의거한 전자서명이 적용되었으며 법적 효력을 가집니다.</p>
    </div>
  </section>
</body>
</html>`;
}
