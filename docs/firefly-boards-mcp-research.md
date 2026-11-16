# Firefly Boards Integration Research (Boards MCP & `aura-doc-service`)

_Compiled Nov 16, 2026 from `Horizon/hz` (`aura-doc-service`, `CanvasPlace`), `Adobe-AIFoundations/hz-aura-boards-mcp`, `Adobe-AIFoundations/mcp-federation-engine-deploy`, and AURA Wiki (`4057832152`, `4116170386`)._

## 1. Executive Summary

- **Firefly Boards DOES have an internal server API (`aura-doc-service`) and MCP server (`hz-aura-boards-mcp`)** exposed via the **Adobe Federated MCP Gateway / Agent Gateway (AGW)** (`ff-boards-mcp`).
- **Two distinct tool surfaces exist:**
  1. **Server-side MCP (`hz-aura-boards-mcp` → `aura-doc-service`):** Exposes 5 tools (`boards_create_new_board`, `boards_add_items_to_board`, `boards_edit`, `boards_read`, `boards_delete`) backed by `POST /v2/create-new-board`, `POST /compose`, etc. Works headlessly with the user's **Adobe IMS OAuth Bearer token**.
  2. **Client-side in-app tool (`boards_canvas_place` in `CanvasPlace.tool.ts`):** Runs only inside an open Firefly Boards browser session via the in-app Aura Agent graph runtime. It supports `source: "text"` to create editable text nodes, whereas the server-side `/add-text` handler in `AtomicBoardV2RequestHandlers.ts:824` currently throws **HTTP 501 (`V2AddTextUnsupported`)**.
- **How to ship "Send Contact Sheet to Firefly Boards" right now (despite `/add-text` = 501):**
  - **Pattern 1 — Named Artboard Containers + Image Placement (Editable Titles Today):** `boards_edit` (`POST /compose`) supports `op: "create", kind: "artboard", name: "<Editable Text>"` with exact `at: { kind: "rect", rect: { x, y, width, height } }`. Each asset (or group) can be placed into a named artboard or positioned on a grid using the **pre-signed AEM `thumbnailUrl`** (`type: "presignedUrl"`) or **`type: "rawBlob"`**.
  - **Pattern 2 — Rendered Composite Cards (`rawBlob`):** Render each contact-sheet cell (thumbnail + metadata caption lines below it) or each group as a crisp PNG card in our worker and pass `{ type: "rawBlob", bytesBase64, mimeType: "image/png", width, height }` with exact `(x, y, width, height)` grid coordinates via `boards_edit` (`POST /compose`). Every card is individually movable/arrangeable on the infinite canvas and shows all selected metadata below the preview.
  - **Pattern 3 — Native Editable Text Nodes (once `aura-doc-service` enables `/add-text` or exposes `addText` in `/compose`):** Drop in editable text entities directly below each placed image.

---

## 2. Endpoints & Environments

| Setting | Production | Stage / Dev |
|---|---|---|
| **Boards Web URL (`FIREFLY_BOARDS_WEB_BASE_URL`)** | `https://firefly.adobe.com/boards` | `https://firefly-stage.corp.adobe.com/boards` |
| **Aura Doc Service (`BOARDS_BASE_URL`)** | `https://hz-aura-doc-service.adobe.io/` | `https://hz-aura-doc-service-stage.adobe.io` |
| **Boards MCP Public Resource URL** | `https://hz-aura-boards-mcp.adobe.io` | `https://hz-aura-boards-mcp-dev.adobe.io` |
| **AGW / Federated MCP upstream (`ff-boards-mcp`)** | `https://hz-aura-boards-mcp-int.private.adobe.io/mcp/` | `https://hz-aura-boards-mcp-dev-int.private.adobe.io/mcp/` |
| **1P Chat Harness AGW Endpoint** | `https://adobe-aif-mfe-chat-harness-prod.adobe.io/mcp` | `https://adobe-aif-mfe-chat-harness-stage.adobe.io/mcp` |

**Authentication:**
- **Via Federated MCP / Agent Gateway (AGW):** Full OAuth 2.1 flow with Adobe IMS login (`/.well-known/oauth-protected-resource` + `/oauth/authorize` + `/oauth/token`), or forward the signed-in user's IMS Bearer token (guest tokens `atp: "guest"` are blocked).
- **Direct to `aura-doc-service`:** `Authorization: Bearer <IMS user token>` + `x-api-key: <BOARDS_API_KEY>` (stored in Vault under `FF-Boards-MCP`).

---

## 3. Server-Side MCP Tools & `POST /compose` Schemas

### 3.1 `boards_create_new_board` → `POST /v2/create-new-board`
- **MCP Input:** `{ "doc_name": "Hertz 2026 Fall Shoot — Contact Sheet", "items"?: AddItemInput[] (0–12) }`
- **Service Input:** `{ "docName": "Hertz 2026 Fall Shoot — Contact Sheet" }`
- **Output:** `{ "boardId": "urn:aaid:sc:US:...", "boardUrl": "https://firefly.adobe.com/boards/id/..." }`

### 3.2 `boards_edit` → `POST /compose` (Up to 20 operations per call, up to 48 placements per `add` op)
- **MCP Input:**
  ```json
  {
    "board_id": "urn:aaid:sc:US:...",
    "ops": [
      {
        "op": "create",
        "kind": "artboard",
        "ref": "group_suv",
        "name": "Vehicle Class: SUV (18 assets)",
        "width": 2400,
        "height": 1600,
        "at": { "kind": "rect", "rect": { "x": 0, "y": 0, "width": 2400, "height": 1600 } }
      },
      {
        "op": "add",
        "into": "$group_suv",
        "autoStack": false,
        "items": [
          {
            "type": "presignedUrl",
            "urls": ["https://author-p59602-e520244.adobeaemcloud.com/aem-blob-..."]
          }
        ]
      }
    ]
  }
  ```
- **Item Input Union (`AddItemInput`):**
  - `presignedUrl`: `{ type: "presignedUrl", urls: ["https://..."] }` — **Note:** `aura-doc-service` fetches these URLs without forwarding auth headers (`resolveItems.ts`), which means **AEM's pre-signed blob `thumbnailUrl`s (with 12h SAS signatures) work out of the box!**
  - `rawBlob`: `{ type: "rawBlob", bytesBase64: "...", mimeType: "image/png" | "image/jpeg", width: 480, height: 600 }` — Decoded directly by Node and placed at `(width, height)`.
  - `cloudAsset`: `{ type: "cloudAsset", assetIds: [...] }`
  - `generationUrn`: `{ type: "generationUrn", assetIds: [...] }`

### 3.3 Why `/add-text` is currently 501 on the server vs. working in the client
- **Server (`services/aura-doc-service/src/apis/boards-atomic/AtomicBoardV2RequestHandlers.ts#L824`):**
  - The `/add-text` route validates `boardId` and `text` and immediately throws `501 V2AddTextUnsupported` before opening `BoardSessionV2`.
- **Client (`apps/aura/features/aura-agent/src/authoring/graph/tools/CanvasPlace/CanvasPlace.tool.ts#L608`):**
  - `boards_canvas_place` runs in the browser against the live canvas state (`operation: "place_on_canvas" | "place_in_container" | "edit_text"`, `items: [{ source: "text", ... }]`). It cannot be called headlessly without an open Firefly Boards browser tab.
