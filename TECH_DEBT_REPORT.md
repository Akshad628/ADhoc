# Technical Debt Report - ADhoc.ai

This document lists the technical debt, duplicate implementations, dead code, dependency issues, and architecture problems identified during the architectural audit of the ADhoc.ai codebase.

---

## 1. Duplicated Code & APIs

### 1.1 Duplicate Dashboard Endpoints (in `Backend/main.py`)
There are identical duplicate implementations of student, faculty, call, and session dashboard endpoints:
- `@app.get("/api/dashboard/students")` (Lines 662-670 and Lines 757-765)
- `@app.get("/api/dashboard/faculty-list")` (Lines 673-681 and Lines 768-776)
- `@app.get("/api/dashboard/calls")` (Lines 684-719 and Lines 779-814)
- `@app.get("/api/dashboard/sessions")` (Lines 722-755 and Lines 817-850)

*Impact:* Increased file size, confusion for developers, redundant endpoints in FastAPI route mapping. Python overrides the first declarations with the second, rendering the first copy entirely dead.

### 1.2 Duplicate Scholarship Endpoints (in `Backend/main.py`)
The student scholarship endpoints are defined in two separate places with slightly different naming and payloads:
- **Obsolete Copy (Lines 3571-3608):**
  - `/api/student/scholarships`
  - `/api/student/scholarships/applications`
  - `/api/student/scholarships/{scholarship_id}/apply`
- **Active Copy (Lines 4034-4104):**
  - `/api/student/scholarships`
  - `/api/student/scholarships/{sch_id}/apply`
  - `/api/student/my-scholarships`

*Impact:* The frontend is wired to fetch `/api/student/scholarships` (expecting the `applied` boolean field) and `/api/student/my-scholarships` (expecting a nested `scholarship` singular object), which matches the active copy at the bottom of `main.py`. The copy at lines 3571-3608 is completely dead.

### 1.3 Duplicate Python Dependencies Configuration
- `requirements.txt` at the root and `Backend/requirements.txt` contain identical package specifications.
- Both files are encoded in `UTF-16`, which causes rendering issues in standard tools (e.g. `pip` on some platforms, file viewers, and standard agent parsers).

---

## 2. Dead Code & Abandoned Experiments

### 2.1 Unused Frontend Clients
- `frontend/src/services/voice/WebSocketClient.ts` is fully commented out.
- `frontend/src/services/voice/FastRTCClient.ts` is fully implemented but is never imported or used anywhere in the codebase.
- `VoiceCallPage.tsx` implements its WebSocket connection logic directly inlined instead of using these services.

### 2.2 Telephony VAD vs. Browser VAD Inconsistency
- The backend manual WebSocket `/ws/voice/{session_id}` has VAD logic (Silence & RMS detection) implemented specifically for Twilio (mu-law) streams (Lines 1566-1595), but lacks VAD implementation for browser PCM bytes (Lines 1543-1552).
- The browser stream falls back to accumulating 8 seconds of audio before forcing a transcription, causing a very high conversational latency.

---

## 3. Architecture Issues

### 3.1 Monolithic `main.py`
The `Backend/main.py` file is over 4,100 lines long. It violates the separation of concerns by combining:
- Database connectivity & config
- JWT auth, signup, login, and user routes
- Admin, Faculty, and Student dashboard endpoints
- Scholarship management
- Session/Call logs and analytics
- Knowledge Base management (file uploads, DB updates)
- Audio codec and resampling conversions
- Multiple WebSocket servers (telephony, manual voice stream)

### 3.2 Lack of Typed Interfaces on Frontend
- Many calls in `VoiceCallPage.tsx` and other pages use manual inlined JSON/WebSocket structures, lacking shared TS interfaces or abstractions.
- Hardcoded URLs like `ws://localhost:8000/ws/voice/${sessionId}` limit production deployment flexibility.

---

## 4. Performance & Reliability Issues

### 4.1 Synchronous Event Loops
- FastRTC runs on standard event loops, but calls asynchronous guidance engine functions. Some blocks use `loop.run_until_complete` synchronously instead of natively awaiting, which blocks the event loop thread.
- Blocking calls to the database during real-time streaming sessions add unnecessary latency.

### 4.2 Error Handling
- Broad `except Exception:` blocks suppress errors without logging tracebacks, making debugging voice drops or TTS failure states difficult.

---

## 5. Recommendations for Stabilization

1. **Modularize the Backend:** Split `main.py` into distinct APIRouter files in a `Backend/routers/` directory:
   - `auth.py`, `dashboard.py`, `agents.py`, `sessions.py`, `calls.py`, `knowledge.py`, `prompts.py`, `analytics.py`, `voice.py`, `student.py`, `admin.py`.
2. **Deduplicate Endpoints:** Delete the overridden dashboard and scholarship endpoints from `main.py` / routers.
3. **Consolidate requirements.txt:** Keep a single clean `requirements.txt` encoded in UTF-8 at the root and link or copy it cleanly.
4. **Implement Voice client Fallback:** Update `VoiceCallPage.tsx` to use a unified `VoiceTransport` factory.
   - Refactor `FastRTCClient.ts` to implement `VoiceTransport` for the WebRTC stream.
   - Refactor `WebSocketClient.ts` (uncomment it) to implement `VoiceTransport` for the fallback WebSocket.
   - The UI should initialize FastRTC first, and dynamically fallback to the manual WebSocket on any WebRTC failure.
5. **Improve WebSocket Browser VAD:** Add RMS calculation and turn detection for browser PCM bytes inside `main.py` / `voice.py` to match the telephony VAD experience, reducing conversational latency for the fallback mode.
