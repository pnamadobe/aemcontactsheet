# Firefly Boards Integration Research (Boards MCP & `aura-doc-service`)

_Compiled Nov 16, 2026 from `Horizon/hz` (`aura-doc-service`, `CanvasPlace`), `Adobe-AIFoundations/hz-aura-boards-mcp`, `Adobe-AIFoundations/mcp-federation-engine-deploy`, and AURA Wiki (`4057832152`, `4116170386`). **Live-probed and verified against Production (`adobe-copilot-prod.adobe.io/mcp` and `hz-aura-doc-service.adobe.io`).**_

## 1. Executive Summary & Live Verification

- **Live-verified in Production (Nov 16, 2026):**
  1. **Direct REST (`https://hz-aura-doc-service.adobe.io`):** Sending a standard Adobe IMS user Bearer token + `x-api-key: aura_webapp` works directly over public HTTPS (`POST /v2/create-new-board`, `POST /compose`, `POST /read-board`).
  2. **Federated MCP Gateway (`https://adobe-copilot-prod.adobe.io/mcp`):** Does **not** have a source-IP block, accepts a standard Adobe IMS Bearer token, exchanges it via OBO, and exposes all 6 Boards MCP tools (`boards_create_new_board`, `boards_add_items_to_board`, `boards_edit`, `boards_read`, `boards_delete`, `create_firefly_board`).
- **Two distinct tool surfaces exist:**
  1. **Server-side MCP / REST (`hz-aura-boards-mcp` → `aura-doc-service`):** Works headlessly from our App Builder actions using the signed-in user's IMS Bearer token.
  2. **Client-side in-app tool (`boards_canvas_place` in `CanvasPlace.tool.ts`):** Runs only inside an open Firefly Boards browser session via the in-app Aura Agent graph runtime. It calls `textUtils.createTextWithDefaults({ x: 0, y: 0 }, parent)` + `textUtils.setText(textEntity, text)` (powered by `TextFoundationBrick` WASM text shaping), whereas `BoardSessionV2.addText()` in the Node service (`AtomicBoardV2RequestHandlers.ts:824`) is currently a stub that throws **HTTP 501 (`V2AddTextUnsupported`)** because `TextFoundationBrick` isn't wired in Node yet.

---

## 2. How to Place Images AND Metadata Text on Firefly Boards Right Now

We traced all four entity types in `BoardSessionV2.ts` (`image`, `artboard`, `stack`, `text`) and their on-canvas rendering in `Horizon/hz`:

| Approach | How it works in `POST /compose` (`boards_edit`) | How text appears on the Firefly Board | Pros / Cons |
|---|---|---|---|
| **A. Artboard-per-Asset Card + Group Stacks/Artboards (Editable Text Labels Today)** | Create a **Stack** (`createStack`, `name: "Group: SUV (18)"`) or header Artboard for each group, and/or create an **Artboard** (`createArtboard`, `name: "#001 · Vehicle Class: SUV · 2026"`, `placement: { kind: "rect", rect: { x, y, width, height } }`) and add the asset image into it (`addItemsToArtboard` with `presignedUrl` or `rawBlob`). | `ArtboardNameAtomicDecorationPlugin` renders `artboard.name` as an **editable on-canvas text label at the upper-left edge of the artboard**. `StackNameAtomicDecorationPlugin` renders `stack.name` as an **on-canvas name pill with a stack icon**. | **100% native Boards entities & editable labels today** with zero rasterized text. Caveat: `ArtboardNameTextTruncation` single-line truncates with `…` if the label is wider than the artboard. |
| **B. Composite Contact-Sheet Card Image (`rawBlob`)** | Render each cell (thumbnail + multi-line metadata caption below it) as a crisp PNG card (`image/png` — note: `resolveItems.ts` uses `sharp` and accepts **only `image/png`, `image/jpeg`, `image/webp`**, NOT `image/svg+xml`, and requires `width`/`height` to **exact-match** the PNG header dimensions) and place it on the canvas or inside a group artboard at `(x, y)`. | Multi-line metadata (`Title`, `Vehicle Class`, `Description`, `#001`) is rendered directly beneath each thumbnail on its card, looking identical to the PDF contact sheet. | **Supports unlimited multi-line metadata & custom formatting** below every thumbnail; each card is still an independent draggable item on the board. Text is baked into the card bitmap rather than a text node. |
| **C. Hybrid (Best of Both)** | Group assets into **named Group Artboards** (`createArtboard` with `name: "Vehicle Class: SUV (18 assets)"` — editable native text header) AND place either raw images or composite caption cards inside each group artboard (`addItemsToArtboard`). | Group headers are native editable Boards artboard titles; per-asset metadata is visible on every card. | Gives users both native Boards containers/titles and full multi-line per-asset metadata. |
| **D. Native `addText` (Future / Upstream PR to `Horizon/hz`)** | Wire `TextFoundationBrick` (or a headless text archetype factory) into `BoardSessionV2.addText()` and `ComposeV2RequestHandler.ts` (which already has the `addText` case stubbed at line 349). | Creates standalone editable `TextNodeArchetype` nodes below each image. | Requires a change in `Horizon/hz` (`services/aura-doc-service`). |

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
