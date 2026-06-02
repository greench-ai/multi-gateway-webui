# HubClaw Rooms — Design Doc (v0.1, for sign-off)

> **Status:** Awaiting Greench approval
> **Author:** Goten
> **Date:** 2026-06-02
> **Scope:** WebUI feature only. Backend / Brainclaw integration is a follow-up.

---

## 1. What is a Room?

A **room** is a named, multi-agent conversation. The operator (you) and 1+ agents from the 9 connected gateways are members. When you type, the message fans out to all member agents. When any agent replies, the reply appears in the shared thread — visible to you AND to the other member agents (so they can build on each other's responses).

**Use cases the design supports:**

- **Project rooms** — ad-hoc, scoped to a task. Example: "HubClaw build" with you + Goten + Gohan to plan the next feature.
- **Standing rooms** — long-lived, scoped to an ongoing concern. Example: "Security" with you + Fuma + Goten + Gohan + Akira, fed by a cron that polls Beszel and posts alerts.
- **1:1 chats** — a room with one member is just a chat. Same UI, same data model. No special case.

## 2. Mental model

A room is a **shared session** across N agents + the operator. Each agent has its own session (per-agent memory), but the room keeps a single ordered message thread that all participants read and write to.

```
        Operator (you)
              │
              │  types "what should we build next?"
              ▼
    ┌──────────────────────┐
    │   Room: "HubClaw"    │
    │   members:           │
    │     - you            │
    │     - goten          │
    │     - gohan          │
    └──────────────────────┘
              │
       fan-out (chat.send)
              │
   ┌──────────┼────────────┐
   ▼          ▼            ▼
 goten     gohan        (future members)
 session   session
   │          │
   │  replies with     │
   │  design proposal   │
   │                   │
   │          │        │
   │   replies with    │
   │   security review │
   │                   │
   └─────────┴─────────┘
              │
              ▼
    Shared thread (chronological)
    - you: "what should we build next?" 19:31
    - goten: "design proposal..." 19:31
    - gohan: "security review..." 19:32
    - you: "go with option B" 19:35
```

## 3. Data model

All data lives client-side in IndexedDB for v1. A future "Brainclaw-backed" storage is a swap-in for the persistence layer (see §9).

```ts
// ─── Room ─────────────────────────────────────────────────────────────────────
interface Room {
  id: string;                       // uuid, generated on creation
  name: string;                     // operator's label, e.g. "HubClaw build"
  description?: string;             // optional, markdown
  members: RoomMember[];            // participants
  createdAt: number;                // ms epoch
  updatedAt: number;                // last message timestamp
  archived: boolean;                // soft-delete flag
  pinned: boolean;                  // sticky to top of sidebar
}

interface RoomMember {
  agentId: string;                  // gateway id (e.g. "goten")
  addedAt: number;
  addedBy: 'operator';              // v1: only operator adds members
}

// ─── RoomMessage ──────────────────────────────────────────────────────────────
interface RoomMessage {
  id: string;                       // uuid
  roomId: string;
  author: MessageAuthor;
  content: string;                  // markdown ok
  timestamp: number;
  /** Per-agent fan-out state. One entry per member agent the message was sent to. */
  delivery: MessageDelivery[];
  /** Agent replies, in the order they arrive. */
  replies: AgentReply[];
  /** True if the operator cancelled the message before all replies arrived. */
  cancelled: boolean;
}

type MessageAuthor =
  | { kind: 'operator' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'system'; reason: 'member-joined' | 'member-left' | 'room-created' | 'cron-event' };

interface MessageDelivery {
  agentId: string;
  status: 'pending' | 'sent' | 'failed';
  sessionKey: string;               // deterministic: `${roomId}:${agentId}`
  error?: string;
  sentAt?: number;
}

interface AgentReply {
  id: string;                       // matches a chat message id from the gateway
  agentId: string;
  content: string;
  timestamp: number;
}
```

### 3.1 Session key convention

To make rooms feel like a single session to each agent (so the agent has memory of prior turns), every room gets one **session per agent**, keyed by:

```
sessionKey = `room:${roomId}:${agentId}`
```

When the operator sends a message, the WebUI calls `chat.send(sessionKey, text)` on **each member's gateway** in parallel. The agent sees a single growing session and replies in context. When the agent replies, the gateway emits an `agent.message` event, the WebUI captures it under the room, and renders it in the thread.

This works because `chat.send` on a non-existent sessionKey creates the session on first call. The agent doesn't need to know it's in a "room" — the room is a UI construct.

## 4. UI

### 4.1 Sidebar — add a Rooms tab

```
┌─ HubClaw ─────────────────┐
│ [Gateways] [Rooms] [+ New] │
│                            │
│ ▾ ROOMS (3)                │
│   📌 Security              │
│      4 members · 12 msgs   │
│   ⚡ HubClaw build         │
│      2 members · 8 msgs    │
│   📁 Old experiments       │
│      (archived)            │
│                            │
│ ▾ GATEWAYS (9)             │
│   (existing 9 cards)       │
└────────────────────────────┘
```

Tab switch is local state; both panels are visible depending on the active tab. The "Gateways" tab keeps the existing per-agent chat UX. The "Rooms" tab is the new thing.

### 4.2 Room list (Rooms tab)

Each row shows: name, member count, last-message timestamp, unread dot if there are new messages from agents since the operator last viewed the room.

Click → opens the room view.

### 4.3 Room view (right pane)

```
┌─ HubClaw build ─────────────────── ⚙ ┐
│ Members: Goten 🐉, Gohan 🧠, You    │
│                                       │
│  [system] Room created 19:00          │
│  [system] Gohan joined 19:01          │
│                                       │
│  you · 19:31                          │
│  ┌─────────────────────────────────┐  │
│  │ What should we build next?      │  │
│  └─────────────────────────────────┘  │
│    ✓ goten  ✓ gohan  (delivered)     │
│                                       │
│  goten · 19:31                        │
│  ┌─────────────────────────────────┐  │
│  │ Let's add rooms. I'll draft a  │  │
│  │ data model...                  │  │
│  └─────────────────────────────────┘  │
│                                       │
│  gohan · 19:32                        │
│  ┌─────────────────────────────────┐  │
│  │ Security review: rooms need    │  │
│  │ scoped access. I recommend...  │  │
│  └─────────────────────────────────┘  │
│                                       │
│  you · 19:35                          │
│  ┌─────────────────────────────────┐  │
│  │ Go with option B.               │  │
│  └─────────────────────────────────┘  │
│                                       │
├───────────────────────────────────────┤
│  [type a message...]            [Send] │
└───────────────────────────────────────┘
```

The ⚙ button opens a **Room settings modal** (rename, manage members, archive, pin, change description).

### 4.4 Member-selector modal (create / edit room)

```
┌─ New Room ──────────────────────────┐
│ Name: [____________________]        │
│ Description (optional):             │
│ [________________________________]  │
│                                     │
│ Members:                            │
│ ☑ goten 🐉  (you)                   │
│ ☑ gohan 🧠                          │
│ ☐ kojiro ⚡                         │
│ ☐ fuma 🔬                           │
│ ...                                 │
│                                     │
│           [Cancel]  [Create Room]   │
└─────────────────────────────────────┘
```

The operator's name is implicit; the modal shows the agents to invite.

### 4.5 Empty states

- **No rooms yet:** "Create a room to start a multi-agent conversation. Pick a name, add agents, send a message."
- **Room has 0 agents:** "Add members to start chatting. [Manage members]"
- **Room has members but no messages:** "Type a message — it'll go to all N members."

## 5. Fan-out protocol (how it actually works)

When the operator sends a message in a room with members `[goten, gohan]`:

```
1. Construct RoomMessage { id, roomId, content, author: operator, delivery: [], replies: [] }
2. Persist to IndexedDB (optimistic)
3. For each member agent (in parallel):
     a. Determine sessionKey: `room:${roomId}:${agentId}`
     b. Call rpc("chat.send", { sessionKey, message: content }) on the member's gateway
     c. On success → update delivery status to "sent", record sentAt
     d. On failure → update delivery status to "failed", record error
4. Subscribe to chat-message events from each member's gateway,
   filter by sessionKey, append to replies as AgentReply arrives
5. When all deliveries resolved (all sent or failed), mark message "complete"
6. Re-render room view with the new message + per-agent delivery status
```

**Timeouts:** 60s per delivery. After 60s, mark "failed: timeout". Operator can hit "retry" on individual failed deliveries.

**Cancellation:** If the operator navigates away mid-flight, deliveries continue in the background and replies still come in. The room updates when the operator returns.

**Cancellation v2 (not v1):** A "stop" button on the in-flight message that sends `chat.abort` (or `run.cancel`) to each delivery in flight. Skipped for v1 to ship faster.

## 6. Receiving agent replies

The WebUI's `connectionManager` already forwards `chat-message` events. For rooms:

```
on('chat-message', (gatewayId, sessionKey, message) => {
  if (!sessionKey.startsWith('room:')) return;       // ignore non-room messages
  const [, roomId, agentId] = sessionKey.split(':');
  if (gatewayId !== agentId) return;                  // sessionKey says which agent replied
  roomsManager.handleAgentReply(roomId, message);
});
```

`roomsManager.handleAgentReply` appends the message to the room's `RoomMessage.replies`, persists, and emits a state-change so the room view re-renders.

If the agent's gateway isn't connected when a reply would arrive, the reply is missed. v1: log it. v2: queue and retry on reconnect.

## 7. Per-agent session memory

Each agent sees a single session per room. The session is **created on first message** in that room. From the agent's perspective it's a normal chat with one user. The agent doesn't see other agents' replies unless we send them.

**Question for design sign-off:** should the agent see other agents' replies in the room?

- **Option A: No** — each agent only sees the operator's messages. Simpler, less context. Agent acts on the operator's request alone.
- **Option B: Yes** — when one agent replies, the next agent sees it as prior context. This makes the room a true group conversation, but agents may start parroting each other or arguing.
- **Option C: Operator chooses per-room** — a toggle "share replies with members" in room settings. Default to A; opt-in for B.

**Recommendation: Option C, default to A.** The HubClaw-build use case wants B (so Goten and Gohan can build on each other). The Security use case wants A (each agent checks its own host and reports, no need to see the others' responses).

For Option B, the WebUI's `chat.send` to the second agent includes a system prefix:

```
[Room: HubClaw build]
[Other participants in this room: goten, gohan]
[Recent replies:]
  - goten (19:31): Let's add rooms. I'll draft a data model...
  - gohan (19:32): Security review: rooms need scoped access...

Your task: <operator's original message>
```

Each agent gets the **prior replies** appended as context, before their own turn. This way the agent knows the room state without us needing cross-agent shared memory.

## 8. UI states to design (one per row)

| State | Trigger | What to show |
|-------|---------|--------------|
| Empty room | Room created, no messages | "Type a message — it'll go to N members" |
| Sending | Operator sent message, deliveries in flight | Per-agent delivery chips: ⏳ sent / ✓ sent / ✗ failed |
| Partial reply | Some agents replied, some not | Each reply rendered as it arrives, others shown as "thinking..." |
| All replied | All deliveries sent + at least one reply | Normal full thread |
| Failed delivery | One or more agents failed | Inline retry button on the failed chip |
| Agent offline | Member agent's gateway is not connected | Disabled state — message still queues for when it reconnects (v2) or fails immediately (v1) |
| No permission | Future: agent has read-only on this room | Stub for v2 |

## 9. Persistence

**v1:** IndexedDB only. Schema in a new object store `rooms`. Two stores: `room` (one record per room) and `room-message` (one per message, indexed by `roomId`).

**v2:** Swap to Brainclaw hub at `acebrain.greench-ai.net:3002`. The `rooms-manager` exposes the same interface; only the persistence backend changes. Backend can be a simple HTTP API on the hub: `GET /rooms`, `POST /rooms`, `POST /rooms/:id/messages`. The fan-out stays in the WebUI.

**Why v1 ships client-side:** Faster to ship, no new infra, no auth dance with Brainclaw. For ad-hoc project rooms this is fine. The downside is rooms are per-browser; if you open the WebUI on a different machine, you don't see the same rooms. For v2, Brainclaw fixes that.

## 10. What ships in v1

- Data model + types
- `src/stores/rooms-manager.ts` — CRUD on rooms, messages, replies; fan-out coordinator
- `src/stores/rooms-storage.ts` — IndexedDB persistence
- `src/components/rooms-tab.ts` — sidebar Rooms tab
- `src/components/room-list.ts` — list of rooms
- `src/components/room-view.ts` — the room thread UI
- `src/components/room-create-modal.ts` — name + member picker
- `src/components/room-settings-modal.ts` — rename, manage members, archive
- `src/components/message-bubble.ts` — shared by chat-panel and room-view
- Refactor `multi-gateway-app.ts` to switch between Gateways / Rooms tabs
- Build, deploy, smoke test

## 11. What does NOT ship in v1

- Brainclaw persistence (v2)
- Stop / cancel in-flight message
- "Share replies with members" toggle (default to A, add toggle in v1.1)
- Read-only member permissions
- Per-room system prompt or context injection
- Mobile-friendly layout polish (just functional, not beautiful)
- Search across rooms

## 12. Open questions for sign-off

1. **Reply-sharing model:** A, B, or C? (see §7) → Recommend C with default A.
2. **Cancel button for in-flight message:** v1 or v2? → Recommend v2.
3. **"Pin to top" and "Archive":** v1, both as simple bool flags in the schema. → Yes, ship in v1.
4. **Member management:** v1 = operator adds/removes. v2 = agents can request to be added? → Just operator for v1.
5. **Naming convention:** "Room" vs "Group" vs "Channel" vs "Thread"? → "Room" matches what Greench called it.
6. **Should rooms support system messages from cron?** (e.g. "Security bot: CPU on aspire at 95%") → Yes, `MessageAuthor.kind = 'system'` covers it.

## 13. File-level plan (v1)

```
src/
  core/
    types.ts                      [MODIFY] add Room, RoomMember, RoomMessage, AgentReply types
  stores/
    rooms-manager.ts              [NEW] CRUD + fan-out + receive replies
    rooms-storage.ts              [NEW] IndexedDB persistence
  components/
    multi-gateway-app.ts          [MODIFY] add Rooms tab switcher
    rooms-tab.ts                  [NEW] sidebar panel
    room-list.ts                  [NEW] list of rooms with search
    room-view.ts                  [NEW] thread + composer for one room
    room-create-modal.ts          [NEW] new room dialog
    room-settings-modal.ts        [NEW] edit/manage members
    message-bubble.ts             [NEW] shared message UI
  utils/
    markdown.ts                   [NEW] tiny markdown renderer for messages (or reuse marked)
```

No new dependencies required (everything in Lit + IndexedDB we already have).

## 14. Test plan (v1)

1. Create a room with 2 members (goten + gohan). Send a message. Both should reply. Replies appear in chronological order. Delivery chips show ✓ for both.
2. Disconnect gohan's gateway. Send a message. Goten replies, gohan's delivery fails. Reconnect gohan, hit retry, gohan replies.
3. Edit a room: add kojiro, remove gohan. New messages go to goten + kojiro. Gohan no longer receives.
4. Archive a room. It moves to the bottom of the list, dimmed. Unarchive restores it.
5. Reload the page. All rooms + messages persist (IndexedDB).
6. Security Room scenario: cron posts a system message every N minutes. Operator sees it in the thread. Operator can reply or just observe.

## 15. Sign-off

If you approve, I'll implement v1 per §10, in this order:

1. Types + storage (smallest, can be unit-tested)
2. `rooms-manager.ts` CRUD (no UI yet)
3. `rooms-tab.ts` + `room-list.ts` (visible structure)
4. `room-create-modal.ts` (create flow)
5. `room-view.ts` + `message-bubble.ts` (the chat part)
6. Fan-out + reply receiving (the live part)
7. `room-settings-modal.ts` (manage)
8. Polish + tests + commit + record

Estimate: ~2-3 hours of focused build. With Greench's review between commits I can pause and get sign-off on the design choices in §12 as I go.

— Goten
