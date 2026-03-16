/**
 * PDF Worker: accepts contract payload, returns PDF bytes.
 * Node.js + Playwright; local Noto Sans KR for Korean (flat repo: index.js and fonts/ are siblings).
 * Auth: Authorization: Bearer <WORKER_SECRET>
 */
import express from "express";
import { chromium } from "playwright";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildHtml } from "./buildHtml.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Fonts directory: pdf-worker/fonts/ when index.js is at pdf-worker/index.js (flat structure). */
const FONTS_DIR = path.join(__dirname, "fonts");

/** Prefer woff2 (smaller payload); TTF only as fallback. */
const FONT_CANDIDATES = [
  { file: "NotoSansKR-Regular.woff2", mime: "font/woff2" },
  { file: "NotoSansKR-Bold.woff2", mime: "font/woff2" },
  { file: "NotoSansKR-Regular.ttf", mime: "font/ttf" },
  { file: "NotoSansKR-Bold.ttf", mime: "font/ttf" },
  { file: "NotoSansKR-Regular.otf", mime: "font/otf" },
];

/** @type {{ mime: string; base64: string } | null} */
let fontEmbed = null;

/** Browser singleton for reuse across requests. */
let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return browser;
}

const FONTS_DIR_ABSOLUTE = path.resolve(FONTS_DIR);

/** Temporary runtime audit for deployed font selection. */
function startupFontAudit() {
  console.log("[PDF-WORKER] audit: FONT_CANDIDATES=", JSON.stringify(FONT_CANDIDATES.map((c) => c.file)));
  let dirList = [];
  try {
    dirList = readdirSync(FONTS_DIR);
  } catch (e) {
    console.log("[PDF-WORKER] audit: readdirSync(FONTS_DIR) failed", e?.message ?? String(e));
  }
  console.log("[PDF-WORKER] audit: readdirSync(FONTS_DIR)=", JSON.stringify(dirList));
  for (const c of FONT_CANDIDATES) {
    const full = path.join(FONTS_DIR, c.file);
    const exists = existsSync(full);
    console.log(`[PDF-WORKER] audit: existsSync(${c.file})=${exists}`);
  }
}

function loadLocalFont() {
  startupFontAudit();
  for (const { file, mime } of FONT_CANDIDATES) {
    const fontPath = path.join(FONTS_DIR, file);
    const fontPathAbsolute = path.resolve(fontPath);
    if (existsSync(fontPath)) {
      try {
        const buf = readFileSync(fontPath);
        fontEmbed = { mime, base64: buf.toString("base64") };
        const ext = file.split(".").pop() || "";
        console.log(`[PDF-WORKER] startup: font found=true path=${fontPathAbsolute} extension=${ext} embeddedPayloadLength=${fontEmbed.base64.length}`);
        return;
      } catch (e) {
        console.warn(`[PDF-WORKER] startup: font read failed path=${fontPathAbsolute}`, e);
      }
    }
  }
  console.warn(`[PDF-WORKER] startup: font found=false path=${FONTS_DIR_ABSOLUTE} (using Google Fonts fallback)`);
}

loadLocalFont();

const PORT = Number(process.env.PORT) || 3000;
const WORKER_SECRET = process.env.PDF_WORKER_SECRET || process.env.WORKER_SECRET;

if (!WORKER_SECRET) {
  console.error("PDF_WORKER_SECRET or WORKER_SECRET is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== WORKER_SECRET) {
    res.status(401).json({ ok: false, error: "UNAUTHORIZED", detail: "Invalid or missing token" });
    return;
  }
  next();
}

app.post("/generate", authMiddleware, async (req, res) => {
  const start = Date.now();
  const payload = req.body;

  if (!payload || typeof payload !== "object") {
    res.status(400).json({ ok: false, error: "BAD_REQUEST", detail: "JSON body required" });
    return;
  }

  try {
    console.log("[PDF-WORKER] residentConsent=", JSON.stringify(payload.residentConsent));
    const html = buildHtml({
      version: payload.version ?? 1,
      signedAt: payload.signedAt ?? "",
      ownerFields: payload.ownerFields ?? {},
      residentFields: payload.residentFields ?? {},
      terms: payload.terms ?? "",
      ownerSignatureUrl: payload.ownerSignatureUrl,
      residentSignatureUrl: payload.residentSignatureUrl,
      fontEmbed,
      residentConsent: payload.residentConsent,
      residentName: payload.residentName,
      ipAddress: payload.ipAddress,
      deviceType: payload.deviceType,
      hostelName: payload.hostelName,
      ownerName: payload.ownerName,
      contractId: payload.contractId,
    });

    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log(`[PDF-WORKER] generate request: fontEmbed=${!!fontEmbed}`);
    const imageCount = await page.evaluate(() => document.images.length);
    console.log(`[PDF-WORKER] waiting for fonts and images, imageCount=${imageCount}`);

    await page.evaluateHandle("document.fonts.ready");
    await page.evaluate(() => {
      const imgs = Array.from(document.images);
      return Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                })
        )
      );
    });

    console.log("[PDF-WORKER] fonts and images ready, generating PDF");
    await page.emulateMedia({ media: "print" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      printBackground: true,
    });

    await page.close();

    console.log(`[PDF-WORKER] generate request: fontEmbed=${!!fontEmbed} pdfBytes=${pdfBuffer.length} success=true`);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Length", String(pdfBuffer.length));
    res.send(Buffer.from(pdfBuffer));
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    console.error(`[PDF-WORKER] generate request: fontEmbed=${!!fontEmbed} success=false`, e);
    res.status(500).json({
      ok: false,
      error: "PDF_GENERATION_FAILED",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "contract-pdf-worker", uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`[PDF-WORKER] listening on port ${PORT}`);
});
