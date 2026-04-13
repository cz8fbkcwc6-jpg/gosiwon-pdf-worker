/**
 * 입실 계약서 PDF용 HTML. 공식 계약서 스타일(흑백·A4 인쇄 대비).
 * Edge `contract-generate-pdf` payload 필드명·구조와 호환 유지.
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

/** img src 등 속성용 (& 포함 URL) */
function escapeAttr(s) {
  if (s == null || typeof s !== "string") return "";
  return escapeHtml(s);
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

function formatCurrency(val) {
  if (val == null) return "";
  const str = String(val).trim();
  const num = Number(str.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return str;
  return num.toLocaleString("ko-KR") + "원";
}

function formatDateYmd(val) {
  if (val == null || typeof val !== "string") return val == null ? "" : String(val);
  const s = String(val).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  }
  return s;
}

const CONSENT_TEXTS = [
  "본 계약은 전자문서로 작성되며 서면 계약과 동일한 법적 효력이 발생함에 동의합니다.",
  "본인은 계약 내용을 충분히 확인하였으며 계약 조건을 이해하고 동의합니다.",
  "본 계약은 본인의 자유로운 의사에 따라 체결하는 것입니다.",
  "본인은 본인의 휴대전화로 수신한 인증번호를 직접 입력하여 계약 절차를 진행하였으며 타인에게 인증번호를 제공하지 않았음을 확인합니다.",
  "계약 체결 및 분쟁 대응을 위하여 필요한 범위 내에서 개인정보가 수집·보관될 수 있음에 동의합니다.",
];

const CURRENCY_KEYS = ["보증금", "월 이용료", "월이용료"];
const DATE_KEYS = ["계약 시작일", "계약 종료일"];

function formatTermsParagraph(rawLine) {
  const line = String(rawLine);
  const trimmed = line.trimStart();
  const match = trimmed.match(/^(제\s*\d+\s*조)/);
  if (!match) return `<p class="term-p">${escapeHtml(line)}</p>`;
  const article = match[1];
  const leadLen = line.length - trimmed.length;
  const lead = line.slice(0, leadLen);
  const afterArticle = trimmed.slice(article.length);
  return `<p class="term-p">${escapeHtml(lead)}<strong>${escapeHtml(article)}</strong>${escapeHtml(afterArticle)}</p>`;
}

function buildTermsBodyHtml(terms) {
  const text = typeof terms === "string" ? terms : "";
  if (!text.trim()) return '<p class="term-p">(조항 없음)</p>';

  const lines = text.split("\n");
  const blocks = [];
  let buf = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^제\s*\d+\s*조/.test(trimmed) && buf.length > 0) {
      blocks.push(buf);
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) blocks.push(buf);
  if (blocks.length === 0) blocks.push(lines);

  return blocks
    .map((blockLines) => {
      const inner = blockLines
        .map((line) => (line.trim() === "" ? '<p class="term-p term-spacer">&nbsp;</p>' : formatTermsParagraph(line)))
        .join("");
      return `<div class="term-article">${inner}</div>`;
    })
    .join("");
}

function buildInfoRows(ownerFields) {
  const rows = Object.entries(ownerFields)
    .map(([k, v]) => {
      let display = String(v ?? "");
      if (CURRENCY_KEYS.includes(k)) display = formatCurrency(v);
      else if (DATE_KEYS.includes(k)) display = formatDateYmd(v);
      return `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(display)}</td></tr>`;
    })
    .join("");
  return rows || '<tr><td class="empty-cell" colspan="2">해당 없음</td></tr>';
}

function buildResidentRows(residentFields) {
  const rows = Object.entries(residentFields)
    .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(String(v ?? ""))}</td></tr>`)
    .join("");
  return rows || '<tr><td class="empty-cell" colspan="2">해당 없음</td></tr>';
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
 *   fontEmbed?: { mime: string; base64: string } | null;
 *   residentConsent?: boolean[];
 *   residentName?: string;
 *   ipAddress?: string;
 *   deviceType?: string;
 *   hostelName?: string;
 *   ownerName?: string;
 *   contractId?: string;
 * }} payload
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

  const residentName =
    (payloadResidentName != null && String(payloadResidentName).trim()) ||
    (residentFields["이름"] != null ? String(residentFields["이름"]).trim() : "") ||
    (residentFields["name"] != null ? String(residentFields["name"]).trim() : "") ||
    "";

  const contractIdFull = String(contractId).trim() || "—";
  const signedAtKo = formatSignedAtKo(signedAt);
  const ver = Number(version ?? 1);

  const termsHtml = buildTermsBodyHtml(terms);

  const consentLines = CONSENT_TEXTS.map((text, i) => {
    const checked = Array.isArray(residentConsent) && residentConsent[i] === true;
    const box = checked ? "☑" : "☐";
    return `<div class="consent-row"><span class="consent-mark" aria-hidden="true">${box}</span><span class="consent-text">${escapeHtml(text)}</span></div>`;
  }).join("");

  const ownerSigHtml = ownerSignatureUrl
    ? `<img src="${escapeAttr(ownerSignatureUrl)}" alt="원장 서명" class="sig-img" crossorigin="anonymous" />`
    : '<span class="sig-placeholder">(서명 없음)</span>';
  const residentSigHtml = residentSignatureUrl
    ? `<img src="${escapeAttr(residentSignatureUrl)}" alt="입주민 서명" class="sig-img" crossorigin="anonymous" />`
    : '<span class="sig-placeholder">(서명 없음)</span>';

  const localFontCss = fontFaceCss(fontEmbed);
  const fallbackFontLink = fontEmbed
    ? ""
    : `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&amp;display=swap" rel="stylesheet" />`;

  const hostelLine = hostelName
    ? `<p class="legal-item"><strong>시설명.</strong> ${escapeHtml(hostelName)}</p>`
    : "";

  const techLine =
    ipAddress || deviceType
      ? `<p class="legal-item legal-tech">${ipAddress ? `접속 IP: ${escapeHtml(String(ipAddress))}` : ""}${ipAddress && deviceType ? " · " : ""}${deviceType ? `기기: ${escapeHtml(String(deviceType))}` : ""}</p>`
      : "";

  const versionNote = ver > 1 ? `<p class="version-note">본 문서는 계약 개정에 따른 버전 ${escapeHtml(String(ver))} 입니다.</p>` : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${fallbackFontLink}
  <style>
    * { box-sizing: border-box; }
    ${localFontCss}
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc { max-width: 100%; }

    .doc-header {
      position: relative;
      margin-bottom: 14pt;
      padding-bottom: 10pt;
    }
    .contract-no {
      position: absolute;
      top: 0;
      right: 0;
      font-size: 9pt;
      font-weight: 400;
      text-align: right;
      line-height: 1.5;
      color: #111;
      z-index: 1;
      max-width: 148px;
      word-break: break-all;
    }
    .contract-no strong { font-weight: 700; }
    .doc-title-wrap {
      text-align: center;
      padding: 0 150px;
    }
    .doc-title {
      font-size: 14pt;
      font-weight: 700;
      margin: 0 0 12pt 0;
      letter-spacing: 0.65em;
      padding-right: 0.65em;
    }
    .title-rule-thick {
      height: 0;
      border: none;
      border-bottom: 3px solid #111;
      margin: 0 auto 5pt;
      width: 78%;
    }
    .title-rule-thin {
      height: 0;
      border: none;
      border-bottom: 1px solid #111;
      margin: 0 auto 0;
      width: 78%;
    }

    .party-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10pt;
      border: 1px solid #333;
      margin-bottom: 14pt;
      page-break-inside: avoid;
    }
    .party-table th,
    .party-table td {
      border: 1px solid #333;
      padding: 10px 12px;
      vertical-align: middle;
      word-break: break-word;
    }
    .party-table th {
      width: 30%;
      background: #f0f0f0;
      font-weight: 700;
      text-align: left;
    }

    .section {
      margin-top: 14pt;
    }
    .section-title {
      font-size: 10pt;
      font-weight: 700;
      margin: 0 0 8pt 0;
    }
    .section-rule {
      border: none;
      border-bottom: 1px solid #111;
      margin: 0 0 10pt 0;
    }

    .info-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10pt;
      border: 1px solid #333;
      page-break-inside: avoid;
    }
    .info-table th,
    .info-table td {
      border: 1px solid #333;
      padding: 10px 12px;
      vertical-align: top;
      word-break: break-word;
    }
    .info-table th {
      width: 30%;
      background: #f0f0f0;
      font-weight: 700;
      text-align: left;
    }
    .empty-cell {
      text-align: center;
      color: #666;
      padding: 12px;
    }

    .terms-box {
      border: 1px solid #333;
      padding: 14px 16px;
      min-height: 80px;
      background: #fff;
      page-break-inside: avoid;
    }
    .term-article {
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .term-article:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .term-p {
      margin: 0 0 6pt 0;
      text-align: justify;
    }
    .term-p:last-child { margin-bottom: 0; }
    .term-spacer { margin: 0; height: 6pt; }

    .consent-block {
      margin-top: 2pt;
      page-break-inside: avoid;
    }
    .consent-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 8px;
      font-size: 10pt;
    }
    .consent-row:last-child { margin-bottom: 0; }
    .consent-mark {
      flex: 0 0 1.2em;
      font-size: 11pt;
      line-height: 1.5;
    }
    .consent-text { flex: 1; text-align: justify; }

    .sign-grid {
      display: flex;
      gap: 12pt;
      margin-top: 4pt;
      page-break-inside: avoid;
    }
    .sign-cell {
      flex: 1;
      width: 50%;
      border: 1px solid #333;
      padding: 12pt 10pt 10pt;
      min-height: 130pt;
      display: flex;
      flex-direction: column;
    }
    .sign-label {
      font-size: 9pt;
      font-weight: 700;
      margin-bottom: 8pt;
      text-align: center;
    }
    .sign-img-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
    }
    .sig-img {
      max-width: 100%;
      max-height: 80px;
      object-fit: contain;
    }
    .sig-placeholder {
      font-size: 9pt;
      color: #777;
    }
    .sign-date {
      text-align: center;
      font-size: 9pt;
      margin-top: 8pt;
      padding-top: 8pt;
      border-top: 1px solid #ccc;
    }

    .legal-box {
      margin-top: 18pt;
      padding: 14pt 16pt;
      background: #f8f8f8;
      border: 1px solid #333;
      font-size: 9.5pt;
      line-height: 1.65;
    }
    .legal-item {
      margin: 0 0 10pt 0;
      text-indent: 0.5em;
    }
    .legal-item:last-child { margin-bottom: 0; }
    .legal-tech { text-indent: 0; font-size: 8.5pt; color: #333; }

    .version-note {
      margin-top: 12pt;
      font-size: 8.5pt;
      color: #555;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="doc">
    <header class="doc-header">
      <div class="contract-no">계약번호: <strong>${escapeHtml(contractIdFull)}</strong>${ver > 1 ? `<br /><span style="font-weight:600;">개정 버전 ${escapeHtml(String(ver))}</span>` : ""}</div>
      <div class="doc-title-wrap">
        <h1 class="doc-title">입&nbsp;&nbsp;실&nbsp;&nbsp;계&nbsp;&nbsp;약&nbsp;&nbsp;서</h1>
        <hr class="title-rule-thick" />
        <hr class="title-rule-thin" />
      </div>
    </header>

    <table class="party-table" role="presentation">
      <tbody>
        <tr>
          <th scope="row">임대인 (원장)</th>
          <td>${escapeHtml(ownerName || "—")}</td>
        </tr>
        <tr>
          <th scope="row">임차인 (입주민)</th>
          <td>${escapeHtml(residentName || "—")}</td>
        </tr>
        <tr>
          <th scope="row">계약번호</th>
          <td>${escapeHtml(contractIdFull)}</td>
        </tr>
      </tbody>
    </table>

    <section class="section">
      <h2 class="section-title">제1조 계약 기본 정보</h2>
      <hr class="section-rule" />
      <table class="info-table" role="presentation"><tbody>${buildInfoRows(ownerFields)}</tbody></table>
    </section>

    <section class="section">
      <h2 class="section-title">제2조 입주민 정보</h2>
      <hr class="section-rule" />
      <table class="info-table" role="presentation"><tbody>${buildResidentRows(residentFields)}</tbody></table>
    </section>

    <section class="section">
      <h2 class="section-title">제3조 계약 조항</h2>
      <hr class="section-rule" />
      <div class="terms-box">${termsHtml}</div>
    </section>

    <section class="section">
      <h2 class="section-title">제4조 계약 체결 동의</h2>
      <hr class="section-rule" />
      <div class="consent-block">${consentLines}</div>
    </section>

    <section class="section">
      <h2 class="section-title">제5조 서명</h2>
      <hr class="section-rule" />
      <div class="sign-grid">
        <div class="sign-cell">
          <div class="sign-label">원장</div>
          <div class="sign-img-wrap">${ownerSigHtml}</div>
          <div class="sign-date">서명일시 ${escapeHtml(signedAtKo || "—")}</div>
        </div>
        <div class="sign-cell">
          <div class="sign-label">입주민 (서명인)</div>
          <div class="sign-img-wrap">${residentSigHtml}</div>
          <div class="sign-date">서명일시 ${escapeHtml(signedAtKo || "—")}</div>
        </div>
      </div>
    </section>

    <div class="legal-box">
      <p class="legal-item"><strong>법적 효력.</strong> 본 문서는 전자문서 및 전자서명에 관한 법령 등 관련 법령이 정하는 바에 따라, 당사자가 앱을 통해 내용을 확인·동의하고 휴대전화 SMS 인증(OTP)으로 본인 확인을 마친 경우 서면 계약과 동일한 법적 효력을 가질 수 있습니다.</p>
      <p class="legal-item"><strong>전자서명 증명.</strong> 본 계약의 체결 시점, 동의 기록, OTP 인증 시각 등은 서비스 시스템에 기록되며, 분쟁 시 전자적 증거자료로 활용될 수 있습니다.</p>
      <p class="legal-item"><strong>플랫폼의 역할.</strong> 본 서비스는 계약 당사자가 아니며, 계약 내용의 적법성·진정성에 대한 책임은 당사자에게 있습니다.</p>
      <p class="legal-item"><strong>서명일시·OTP·버전.</strong> 서명일시 ${escapeHtml(signedAtKo || "—")} · OTP 인증 완료 · 계약 버전 ${escapeHtml(String(ver))}</p>
      ${hostelLine}
      ${techLine}
    </div>

    ${versionNote}
  </div>
</body>
</html>`;
}
