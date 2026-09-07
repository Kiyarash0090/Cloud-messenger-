# Security Specification: Cloud Messenger Authorization & Security Model

## 1. System Overview
Cloud Messenger operates on an Express 4 backend backed by `node:sqlite` (in WAL journal mode) and a React 19 SPA frontend. All persistent data resides in the local SQLite database (`data/app.db`) and files in `data/uploads/`.

The application enforces server-authoritative security: all user identifiers, permissions, timestamps, and relations are derived directly from the authenticated session context (`req.session`) and validated transactionally against the database.

---

## 2. Authentication & Session Lifecycle

### Invariants:
1. **HTTP-Only Cookies**: Authentication is maintained via `cm_session` (or `__Host-cm_session` under HTTPS) with `httpOnly: true`, `sameSite: "strict"`, and `path: "/"`.
2. **Session Lifetimes**:
   - Absolute lifetime: 14 days.
   - Idle inactivity timeout: 7 days.
   - Expired sessions are evicted from database and memory.
3. **Session Revocation & Rotation**:
   - Password changes immediately invalidate all other active sessions for that user.
   - Account deletion terminates all sessions.
4. **Rate Limiting**:
   - Authentication endpoints (`/api/auth/login`, `/api/auth/signup`) are limited to 15 attempts / 15 min per IP.
   - General API routes (`/api/*`) are rate-limited to 1000 req / 15 min.
   - Media uploads are rate-limited to 20 uploads / 10 min per user.
   - Message sends are rate-limited to 40 messages / min per user.

---

## 3. Trust Boundary & Proxy Handling

### Invariants:
1. **Reverse Proxy Trust**: `app.set("trust proxy", 1)` is enabled **only** when `TRUST_PROXY=1` is explicitly set in the environment. Client-controlled `X-Forwarded-For` headers are strictly ignored otherwise.

---

## 4. Authorization & Role Matrix

| Resource / Endpoint | Operation | Required Role / Invariant | Server Validation & Enforcement |
| :--- | :--- | :--- | :--- |
| `GET /api/media/:filename` | Read Media | Authenticated + Chat Member | Resolves file path within `data/uploads/`, checks `uploads` and `chat_members` records. Sets CSP sandbox & nosniff. |
| `POST /api/upload` | Upload Media | Authenticated User | Checks user storage quota (50MB cap), checks magic-byte headers against extension, strips malicious binaries. |
| `GET /api/users` | List Users | Authenticated User | Returns public allowlist only; hides offline/lastSeen based on `lastSeenPrivacy`. |
| `PUT /api/users/:uid` | Update Profile | Self or Global Admin (`isAdmin=1`) | Re-authenticates password on password change, checks handle uniqueness in `handles` table. |
| `DELETE /api/users/me` | Delete Account | Self + Password Verification | Requires password confirmation, purges memberships, releases handle, deletes sessions. |
| `GET /api/chats` | List Chats | Active Chat Member | Returns only chats where caller is active (non-banned) member. |
| `GET /api/chats/:id` | Get Chat | Active Member (or Public Chat) | If private and caller is not a member, returns 404 to avoid leaking existence. |
| `POST /api/chats` | Create Chat | Authenticated User | Validates all member UIDs exist in DB. For DMs, verifies exactly 2 distinct members and checks `blocks` table. |
| `PUT /api/chats/:id` | Update Chat | Chat Owner / Admin (or leavingSelfOnly) | Strict hierarchy: Non-admins can only remove themselves (`leavingSelfOnly`). Admins cannot remove or ban the owner. |
| `POST /api/chats/:id/join` | Join Chat | Public: Direct / Private: Valid Invite | Private chats require valid token in `chat_invites` table with remaining uses and non-expired time. |
| `DELETE /api/chats/:id` | Delete Chat | Chat Owner or Global Admin | Cascade cleans messages, memberships, invites, and media files from disk. |
| `GET /api/chats/:chatId/messages` | Read Messages | Active Chat Member | Enforces join-time visibility (`createdAt >= joinedAt`). Rejects non-members with 403. |
| `POST /api/chats/:chatId/messages` | Send Message | Active Chat Member (Not Muted) | Derives `senderId` and `lastMessage` server-side; validates `replyTo` exists in same chat; verifies block status. |
| `PUT /api/chats/:chatId/messages/:id` | Edit Message | Message Author (`senderId === caller.uid`) | Prevents editing deleted messages or other users' messages. |
| `DELETE /api/chats/:chatId/messages/:id` | Delete Message | Message Author or Chat Admin | Soft-deletes message and unlinks media file from disk. |
| `POST /api/chats/:chatId/messages/:id/reactions` | Toggle Reaction | Active Chat Member | Enforces max 20 distinct emoji reactions per message; validates unicode emoji pattern. |
| `POST /api/admin/db/*` | Admin DB Ops | Authoritative Global Admin (`isAdmin=1`) | Password re-authentication required; validates SQLite 3 format header and schema integrity; safe `VACUUM INTO`. |

---

## 5. Input Sanitization & Content Security

### Invariants:
1. **Unicode & Control Character Sanitization**: All text and filenames are stripped of Unicode Bidi overrides (`U+202A-U+202E`, `U+2066-U+2069`), zero-width characters (`U+200B-U+200D`, `U+FEFF`), and C0/C1 control codes.
2. **Handle Namespace Protection**: Global `handles` table enforces uniqueness across users and chats. Keywords like `admin`, `system`, `root`, `api`, `support` are reserved.
3. **Security Headers**:
   - `Content-Security-Policy`: Strict policy restricting object, frame, base-uri, and script execution.
   - `X-Content-Type-Options: nosniff` on all media and static assets.
