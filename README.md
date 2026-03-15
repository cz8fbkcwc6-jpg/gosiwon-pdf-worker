# Contract PDF Worker

Node.js + Playwright service that turns contract payloads (JSON) into signed contract PDFs. Used by the Supabase Edge Function `contract-generate-pdf`; **no PDF rendering runs inside Supabase Edge**.

## File structure

```
pdf-worker/
├── package.json          # express, playwright; "type": "module"
├── README.md             # this file
└── src/
    ├── index.js          # Express server: POST /generate (auth via Bearer), GET /health
    └── buildHtml.js      # buildHtml(payload) → HTML string (Noto Sans KR, terms, signatures)
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PDF_WORKER_SECRET` or `WORKER_SECRET` | Yes | Shared secret; Edge Function sends `Authorization: Bearer <secret>`. |
| `PORT` | No | Server port (default 3000). |

## API

- **POST /generate**  
  - Headers: `Authorization: Bearer <PDF_WORKER_SECRET>`, `Content-Type: application/json`  
  - Body: contract payload (see below).  
  - Response: `200` with body = raw PDF bytes (`application/pdf`), or `4xx/5xx` JSON `{ ok, error, detail }`.

- **GET /health**  
  - Response: `{ ok: true, service: "contract-pdf-worker" }`.

### Payload shape

```json
{
  "version": 1,
  "signedAt": "2025-03-15T12:00:00.000Z",
  "ownerFields": { "name": "홍길동", "..." : "..." },
  "residentFields": { "name": "김철수", "..." : "..." },
  "terms": "제1조 ...\n제2조 ...",
  "ownerSignatureUrl": "data:image/png;base64,...",
  "residentSignatureUrl": "https://...signed-url... or data:image/..."
}
```

- Korean text: handled via Google Fonts (Noto Sans KR) in the HTML.
- Long terms: normal HTML/CSS; no character limit.
- Signature images: `data:` URLs or HTTPS URLs (e.g. short-lived signed URLs from Supabase).

## Local run

```bash
cd pdf-worker
npm install
npx playwright install chromium
export PDF_WORKER_SECRET=your-secret
npm start
```

## Deploy on Render

1. **Connect repository:** Dashboard → New → Web Service → Connect account → select repo **`gosiwon-pdf-worker`**.
2. **Settings:**
   - **Root Directory:** leave empty (repo root is the worker).
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Add `PDF_WORKER_SECRET` (same value as in Supabase Edge secrets).
3. Deploy. The service URL (e.g. `https://gosiwon-pdf-worker.onrender.com`) is your `PDF_WORKER_URL` in Supabase.

**Repo to select in Render:** `gosiwon-pdf-worker`  
**URL:** `https://github.com/YOUR_USERNAME/gosiwon-pdf-worker`

**Note:** Free tier may spin down after idle; first request can be slow. Use a paid instance for production.

### Railway

1. New project → Deploy from GitHub; root = `pdf-worker` or repo root with root set to `pdf-worker`.
2. Build: install deps + `npx playwright install chromium` (or use Nixpacks/ Dockerfile with Chromium).
3. Start: `npm start`.
4. Variables: `PDF_WORKER_SECRET`.
5. Copy the public URL → Supabase `PDF_WORKER_URL`.

### Google Cloud Run

1. Add a `Dockerfile` in `pdf-worker/` that installs Node, deps, and Playwright Chromium (e.g. base image with Chromium dependencies).
2. Build and push: `gcloud builds submit --tag gcr.io/PROJECT/contract-pdf-worker ./pdf-worker`
3. Deploy: `gcloud run deploy contract-pdf-worker --image gcr.io/PROJECT/contract-pdf-worker --set-env-vars PDF_WORKER_SECRET=... --allow-unauthenticated` (or use IAM and VPC for private access).
4. Use the Cloud Run URL as `PDF_WORKER_URL`.

**Dockerfile sketch:** Use a Node image that includes Playwright dependencies, or a Playwright image, e.g. `mcr.microsoft.com/playwright:v1.49.0-jammy` and run `node src/index.js` after copying app and `npm ci`.

## Supabase Edge Function config

Set in Supabase Dashboard → Project Settings → Edge Function secrets (or `.env` for local):

- `PDF_WORKER_URL` = full base URL of the worker (e.g. `https://contract-pdf-worker.onrender.com`).
- `PDF_WORKER_SECRET` = same value as `PDF_WORKER_SECRET` / `WORKER_SECRET` in the worker.

The Edge Function `contract-generate-pdf` will call `POST ${PDF_WORKER_URL}/generate` with `Authorization: Bearer ${PDF_WORKER_SECRET}` and the contract payload, then upload the returned PDF to Storage and update the contract row.

---

## Final PDF flow (production)

1. **User** (owner or resident) taps **"PDF 보기"** in the app.
2. **Frontend** calls `contract-get-pdf-url` with `contract_id` + `owner_jwt` or `token`.
3. **contract-get-pdf-url** (Edge): checks auth, loads contract row. If `pdf_path` is set, returns a short-lived signed URL for that object in `signed-contract-pdfs`; otherwise returns `need_generation: true`.
4. If **need_generation**:
   - Frontend calls **contract-generate-pdf** (Edge) with same auth.
   - **contract-generate-pdf** (Edge):
     - Verifies auth and that contract is SIGNED.
     - Loads contract + template snapshot (or template fallback).
     - If existing `pdf_path` and `pdf_source_hash` match current content, returns existing path (no worker call).
     - Builds payload (version, signedAt, owner/resident fields, terms, signature URLs).
     - Optionally creates short-lived signed URLs for private signature images so the worker can load them.
     - **POSTs payload to PDF worker** at `PDF_WORKER_URL/generate` with `Authorization: Bearer PDF_WORKER_SECRET`.
     - Worker returns PDF bytes; Edge uploads to `signed-contract-pdfs` at `hostel/{id}/contracts/{contractId}/signed-contract-v{version}.pdf`.
     - Updates contract row: `pdf_path`, `pdf_generated_at`, `pdf_source_hash`.
     - Returns `{ ok: true, pdf_path }`.
   - Frontend calls **contract-get-pdf-url** again and opens the signed URL.
5. **System of record** remains Supabase: `contracts` table holds `pdf_path`, `pdf_generated_at`, `pdf_source_hash`; storage bucket `signed-contract-pdfs` holds one PDF per contract. No public access; only signed URLs for authorized callers.
