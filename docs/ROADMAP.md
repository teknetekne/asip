# 🗺️ ASIP Roadmap

## v1.2: "Collective Wisdom" (Planned)

Moving from a simple task distribution script to a true, resilient P2P intelligence network.

### 1. Fluid P2P Architecture (No More Roles)
- **Goal:** Remove `SEED` and `PEER` static roles.
- **Design:** Every node is equal.
  - If you have a prompt -> You broadcast a request.
  - If you are idle -> You listen for requests.
  - A node can switch between Requester and Worker milliseconds apart.
- **Benefit:** True decentralization. No "servers" needed.

### 2. Consensus & Validation (Quorum)
- **Goal:** Prevent hallucinations and malicious results.
- **Design:**
  - Requester can set `quorum: 3`.
  - Request is sent to 3 different workers.
  - Results are compared (Vector Similarity or LLM Judge).
  - Outliers are rejected; majority wins.
- **Benefit:** Reliability. Trust the *network*, not the individual.

### 3. Capability Discovery (Metadata Routing)
- **Goal:** Send the right task to the right agent.
- **Design:**
  - Nodes announce capabilities on handshake: `{ "gpu": true, "models": ["llama3", "stable-diffusion"], "ram": "64gb" }`
  - DHT lookups filter by capability tag (e.g., find nodes in topic `asip-v1-coding`).
- **Benefit:** Efficiency. Don't ask a Raspberry Pi to render 4K video.

### 4. Reputation Ledger (Local Trust)
- **Goal:** Remember who does good work.
- **Design:**
  - Each node keeps a local SQLite/JSON ledger.
  - Good result = `+1 trust` for that NodeID.
  - Bad/Slow result = `-1 trust`.
  - Prefer high-trust peers for future tasks.

---

## v1.3: "The Marketplace" (Future)
- **Tokenomics:** Optional credits for heavy compute tasks?
- **Web Interface:** Live visualization of the mesh network.
- **Gateway Mode:** HTTP API to let non-agents use the network.
