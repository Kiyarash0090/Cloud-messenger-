# 🚀 Cloud Messenger

Cloud Messenger is a self-hosted messaging application built with Express, `node:sqlite`, and React + Vite.

---

## 🔒 Security & Data Architecture Notice

- **Storage Model**: Messages and user data are stored locally in the server's SQLite database (`data/app.db`).
- **Plaintext Storage Notice**: Messages are stored in plaintext on the server database. The server operator/administrator has direct system access and can inspect database records. This application does not implement client-side End-to-End Encryption (E2EE).
- **Authentication & Sessions**: Authenticated via httpOnly session cookies (`cm_session`), hashed passwords with `bcrypt`, strict CSRF validations, and scoped role-based access control.
- **Media Protection**: Media files are stored securely in `data/uploads/` outside the web root. File access requires session authentication and chat membership verification.

---

## ✨ Features

1. **Authentication & User Management**:
   - Secure signup and login with bcrypt-hashed passwords.
   - Unique usernames across global namespace (`handles` table) with reserved keyword protections.
   - Privacy controls: configurable `lastSeenPrivacy` (everyone, contacts, nobody).

2. **Chats, Groups & Channels**:
   - Private Direct Messages (DMs) with user-level blocking capabilities.
   - Private Groups with invite token authorization and membership protection.
   - Public Channels with verified broadcast permissions.
   - Join-time based history visibility.

3. **Secure Media & File Sharing**:
   - Authenticated `/api/media/:filename` streaming with nosniff, attachment disposition, and strict CSP sandbox headers.
   - Magic-byte validation to reject masquerading binaries (PE/ELF).
   - Sanitized file names removing Unicode bidi/control overrides.

4. **Server Database Management**:
   - Local SQLite database in WAL mode with transactional concurrency.
   - Safe backup (`VACUUM INTO`) and integrity-checked restore options for system administrators.

---

## 🚀 Running the Application

### Development:
```bash
npm run dev
```

### Production Build & Start:
```bash
npm run build
npm start
```

### Running Integration Tests:
```bash
npm test
```
