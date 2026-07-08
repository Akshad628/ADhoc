# Migration and Refactor Plan - ADhoc.ai

This document lists the planned changes, affected files, risk analysis, and rollback strategies for refactoring and stabilizing the ADhoc.ai codebase.

---

## 1. Planned Changes

### Phase 1: Preparation & Environment Optimization
- Convert `requirements.txt` and `Backend/requirements.txt` to UTF-8 encoding.
- Ensure that Python requirements contain clear dependencies, avoiding redundant libraries.

### Phase 2: Backend Refactor (Modularity & Cleanup)
- Delete the duplicated dashboard endpoints (lines 662-756 override) and scholarship endpoints (lines 3571-3608 override) from `Backend/main.py`.
- Create a modular folder structure in the backend:
  - `Backend/routers/`
- Extract endpoints from the monolith `Backend/main.py` into separate routers:
  - `routers/auth.py` (JWT & login/signup)
  - `routers/dashboard.py` (admin, faculty, student dashboard views)
  - `routers/agents.py` (AI agent presets and configurations)
  - `routers/sessions.py` (guidance session storage and management)
  - `routers/calls.py` (call monitoring and status updates)
  - `routers/knowledge.py` (knowledge base document uploads/downloads)
  - `routers/prompts.py` (AI prompt configuration and testing)
  - `routers/analytics.py` (call durations, sentiment summary and dashboards)
  - `routers/voice.py` (telephony webhooks, monitor WebSockets, and browser fallback WebSockets)
  - `routers/student.py` (student profile, academic logs, certifications, skills, achievements, applications)
  - `routers/admin.py` (admin scholarships and application updates)
- Maintain `Backend/main.py` as the lightweight startup/initialization script that mounts the routers and FastRTC WebRTC streams.
- Implement RMS VAD for browser PCM data inside the WebSocket fallback endpoint to reduce latency and align it with the Telephony VAD implementation.

### Phase 3: Frontend Refactor (Voice Layer Consolidation)
- Refactor `frontend/src/services/voice/FastRTCClient.ts` to implement `VoiceTransport` interface.
- Refactor and uncomment `frontend/src/services/voice/WebSocketClient.ts` to implement `VoiceTransport` interface.
- Add the `VoiceTransportFactory` logic to dynamically instantiate the `FastRTCClient` and fall back to `WebSocketClient` if it throws an error or if WebRTC is unsupported.
- Modify `VoiceCallPage.tsx` to call `VoiceTransportFactory.create()` and bind to its events (`onStateChange`, `onTranscript`, `onAudio`, `onError`), completely removing inlined WebSocket and AudioWorklet initialization logic from the page itself.
- **Strict Rule:** Do NOT modify the UI styling, components layout, colors, or animations.

---

## 2. Affected Files

| Component | File Path | Action | Description |
|---|---|---|---|
| **Python Env** | `requirements.txt` | Modify | Convert to UTF-8 |
| **Python Env** | `Backend/requirements.txt` | Modify | Convert to UTF-8 |
| **Backend** | `Backend/main.py` | Modify/Split | Extract routes to routers, leave as runner |
| **Backend** | `Backend/routers/auth.py` | New | Auth endpoints |
| **Backend** | `Backend/routers/dashboard.py`| New | Dashboard endpoints |
| **Backend** | `Backend/routers/agents.py` | New | Agent configs |
| **Backend** | `Backend/routers/sessions.py` | New | Session endpoints |
| **Backend** | `Backend/routers/calls.py` | New | Call logic & Twilio webhooks |
| **Backend** | `Backend/routers/knowledge.py` | New | Knowledge base operations |
| **Backend** | `Backend/routers/prompts.py` | New | Prompts management |
| **Backend** | `Backend/routers/analytics.py` | New | Analytics details |
| **Backend** | `Backend/routers/voice.py` | New | Voice WebSocket servers |
| **Backend** | `Backend/routers/student.py` | New | Student profile features |
| **Backend** | `Backend/routers/admin.py` | New | Admin scholarship operations |
| **Frontend** | `frontend/src/services/voice/VoiceTransportFactory.ts` | Modify | Export factory logic & types |
| **Frontend** | `frontend/src/services/voice/FastRTCClient.ts` | Modify | Implement VoiceTransport |
| **Frontend** | `frontend/src/services/voice/WebSocketClient.ts` | Modify | Uncomment and implement VoiceTransport |
| **Frontend** | `frontend/src/pages/VoiceCallPage.tsx` | Modify | Refactor to use VoiceTransport |

---

## 3. Risks & Mitigation

### Risk 1: FastRTC WebRTC Connection Fails in Certain Network Environments
- *Mitigation:* The frontend will automatically detect connection failure or negotiation exceptions and immediately switch to the manual WebSocket fallback. The fallback is tested to function well over standard HTTP/WS proxies.

### Risk 2: Backend Refactor Introduces Session/State Tracking Failures
- *Mitigation:* Ensure that the shared `guidance_engine` state and configurations (`agent_config`) are correctly passed or injected into all APIRouters. We will keep `CareerGuidanceEngine` instances as singletons.

### Risk 3: Accidentally Modifying UI Visual Appearance
- *Mitigation:* We will strictly make zero changes to JSX/TSX layout, styles, tailwind classes, or animations. We will only change hooks, service layer connections, and state variable updates.

---

## 4. Rollback Strategy

1. **VCS Commits:** We will commit after every step. If any compilation or regression occurs, we can rollback to the previous commit immediately.
2. **Backup files:** We will verify that changes build locally (`npm run build` and `uvicorn` startup check) before finalizing the step.
3. **No-rewrite rule:** We refactor existing endpoints incrementally and extract them as-is before altering any underlying database logic.
