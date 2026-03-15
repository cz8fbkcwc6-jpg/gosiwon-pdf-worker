/**
 * PDF Worker: accepts contract payload, returns PDF bytes.
 * Node.js + Playwright; HTML/CSS with Noto Sans KR for Korean.
 * Auth: Authorization: Bearer <WORKER_SECRET>
 */
import express from "express";
import { chromium } from "playwright";
import { buildHtml } from "./buildHtml.js";

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

  let browser;
  try {
    const html = buildHtml({
      version: payload.version ?? 1,
      signedAt: payload.signedAt ?? "",
      ownerFields: payload.ownerFields ?? {},
      residentFields: payload.residentFields ?? {},
      terms: payload.terms ?? "",
      ownerSignatureUrl: payload.ownerSignatureUrl,
      residentSignatureUrl: payload.residentSignatureUrl,
    });

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 15000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      printBackground: true,
    });

    await browser.close();
    browser = null;

    console.log(`[PDF-WORKER] generated in ${Date.now() - start}ms, size=${pdfBuffer.length}`);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Length", String(pdfBuffer.length));
    res.send(Buffer.from(pdfBuffer));
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error("[PDF-WORKER] error", e);
    res.status(500).json({
      ok: false,
      error: "PDF_GENERATION_FAILED",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "contract-pdf-worker" });
});

app.listen(PORT, () => {
  console.log(`[PDF-WORKER] listening on port ${PORT}`);
});
