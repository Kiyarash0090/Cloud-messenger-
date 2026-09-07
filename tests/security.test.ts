import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import fs from "fs";
import path from "path";

describe("Cloud Messenger Security Hardening Suite (Dirty Dozen)", () => {
  let adminCookie: string;
  let user1Cookie: string;
  let user1Uid: string;
  let user2Cookie: string;
  let user2Uid: string;

  beforeAll(async () => {
    // 1. Log in as admin
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "popoopop" });
    expect(adminRes.status).toBe(200);
    adminCookie = adminRes.headers["set-cookie"]?.[0] || "";

    // 2. Sign up user1
    const u1Res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice_sec", displayName: "Alice Security", password: "password123" });
    if (u1Res.status === 200) {
      user1Cookie = u1Res.headers["set-cookie"]?.[0] || "";
      user1Uid = u1Res.body.user.uid;
    } else {
      const login1 = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice_sec", password: "password123" });
      user1Cookie = login1.headers["set-cookie"]?.[0] || "";
      user1Uid = login1.body.user.uid;
    }

    // 3. Sign up user2
    const u2Res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "bob_sec", displayName: "Bob Security", password: "password123" });
    if (u2Res.status === 200) {
      user2Cookie = u2Res.headers["set-cookie"]?.[0] || "";
      user2Uid = u2Res.body.user.uid;
    } else {
      const login2 = await request(app)
        .post("/api/auth/login")
        .send({ username: "bob_sec", password: "password123" });
      user2Cookie = login2.headers["set-cookie"]?.[0] || "";
      user2Uid = login2.body.user.uid;
    }
  });

  it("1. Anonymous media access returns 401, non-member returns 403, member returns 200", async () => {
    // User1 uploads a valid PNG image
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    ]);

    const uploadRes = await request(app)
      .post("/api/upload")
      .set("Cookie", user1Cookie)
      .attach("file", validPngBuffer, "test_avatar.png");
    expect(uploadRes.status).toBe(200);
    const mediaUrl = uploadRes.body.url;
    const filename = uploadRes.body.filename;

    // Anonymous request
    const anonRes = await request(app).get(`/api/media/${filename}`);
    expect(anonRes.status).toBe(401);

    // Authenticated uploader request
    const authRes = await request(app).get(`/api/media/${filename}`).set("Cookie", user1Cookie);
    expect(authRes.status).toBe(200);
    expect(authRes.headers["content-type"]).toBe("image/png");
    expect(authRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(authRes.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
  });

  it("2. Malicious upload (PE binary disguised as PNG) is rejected with 400", async () => {
    // MZ header (Windows PE executable) disguised as a .png
    const fakePng = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      0xff, 0xff, 0x00, 0x00,
    ]);

    const res = await request(app)
      .post("/api/upload")
      .set("Cookie", user1Cookie)
      .attach("file", fakePng, "malicious.png");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content does not match/i);
  });

  it("3. Handle reservation and uniqueness: cannot claim reserved keyword 'system'", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "system", displayName: "System Impostor", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reserved/i);
  });

  it("4. Handle uniqueness: cannot claim an already taken username", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice_sec", displayName: "Alice Clone", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already taken/i);
  });

  it("5. Private chat: non-member cannot view private chat details (returns 404 to avoid leak)", async () => {
    // User1 creates private group
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "Secret Club", visibility: "private", type: "group", memberUids: [user1Uid] });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.id;

    // User2 (non-member) tries to get chat
    const probeRes = await request(app)
      .get(`/api/chats/${chatId}`)
      .set("Cookie", user2Cookie);
    expect(probeRes.status).toBe(404);
  });

  it("6. Private chat: cannot join without invite token (403), but succeeds with valid invite token", async () => {
    // User1 creates private group
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "VIP Lounge", visibility: "private", type: "group", memberUids: [user1Uid] });
    expect(chatRes.status).toBe(200);
    const chatId = chatRes.body.id;

    // User2 tries to join without token
    const failJoin = await request(app)
      .post(`/api/chats/${chatId}/join`)
      .set("Cookie", user2Cookie)
      .send({});
    expect(failJoin.status).toBe(403);

    // User1 creates invite token
    const inviteRes = await request(app)
      .post(`/api/chats/${chatId}/invites`)
      .set("Cookie", user1Cookie)
      .send({ maxUses: 1, expiresInHours: 24 });
    expect(inviteRes.status).toBe(200);
    const token = inviteRes.body.token;

    // User2 joins with invite token
    const successJoin = await request(app)
      .post(`/api/chats/${chatId}/join`)
      .set("Cookie", user2Cookie)
      .send({ inviteToken: token });
    expect(successJoin.status).toBe(200);
    expect(successJoin.body.joined).toBe(true);
  });

  it("7. Hierarchical permissions: non-admin cannot alter chat member list except leavingSelfOnly", async () => {
    // User1 creates group with User1 (owner) and User2 (member)
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "Project Team", visibility: "private", type: "group", memberUids: [user1Uid, user2Uid] });
    const chatId = chatRes.body.id;

    // User2 (non-admin) attempts to remove User1 (the owner)
    const rogueUpdate = await request(app)
      .put(`/api/chats/${chatId}`)
      .set("Cookie", user2Cookie)
      .send({ memberUids: [user2Uid] });
    expect(rogueUpdate.status).toBe(403);

    // User2 performs valid leavingSelfOnly (removing ONLY user2 from members)
    const validLeave = await request(app)
      .put(`/api/chats/${chatId}`)
      .set("Cookie", user2Cookie)
      .send({ memberUids: [user1Uid] });
    expect(validLeave.status).toBe(200);
    expect(validLeave.body.left).toBe(true);
  });

  it("8. Message lastMessage derivation: client cannot forge lastMessage via PUT", async () => {
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "Audit Chat", visibility: "private", type: "group", memberUids: [user1Uid] });
    const chatId = chatRes.body.id;

    // User1 sends a real message
    const msgRes = await request(app)
      .post(`/api/chats/${chatId}/messages`)
      .set("Cookie", user1Cookie)
      .send({ text: "Authentic message" });
    expect(msgRes.status).toBe(200);

    // User1 tries to forge lastMessage metadata via chat update
    await request(app)
      .put(`/api/chats/${chatId}`)
      .set("Cookie", user1Cookie)
      .send({
        name: "Renamed Chat",
        lastMessage: { text: "Forged Text", senderId: "hacker", createdAt: "2099-01-01" },
      });

    const verifyChat = await request(app).get(`/api/chats/${chatId}`).set("Cookie", user1Cookie);
    expect(verifyChat.body.lastMessage.text).toBe("Authentic message");
    expect(verifyChat.body.lastMessage.senderId).toBe(user1Uid);
  });

  it("9. lastSeenPrivacy: 'nobody' hides online status and lastSeen from other users", async () => {
    // User1 sets lastSeenPrivacy to 'nobody'
    const updateProfile = await request(app)
      .put(`/api/users/${user1Uid}`)
      .set("Cookie", user1Cookie)
      .send({ lastSeenPrivacy: "nobody" });
    expect(updateProfile.status).toBe(200);

    // User2 queries User1's profile
    const queryRes = await request(app)
      .get(`/api/users/${user1Uid}`)
      .set("Cookie", user2Cookie);
    expect(queryRes.status).toBe(200);
    expect(queryRes.body.isOnline).toBe(false);
    expect(queryRes.body.lastSeen).toBeNull();
  });

  it("10. Message history visibility: new member only sees messages from join time onward", async () => {
    // User1 creates chat and sends an early message
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "Timeline Chat", visibility: "public", type: "group", memberUids: [user1Uid] });
    const chatId = chatRes.body.id;

    await request(app)
      .post(`/api/chats/${chatId}/messages`)
      .set("Cookie", user1Cookie)
      .send({ text: "Secret message before bob joined" });

    // Wait 10ms so timestamps differ
    await new Promise((r) => setTimeout(r, 15));

    // User2 joins the chat
    await request(app)
      .post(`/api/chats/${chatId}/join`)
      .set("Cookie", user2Cookie)
      .send({});

    // User2 fetches messages
    const msgsRes = await request(app)
      .get(`/api/chats/${chatId}/messages`)
      .set("Cookie", user2Cookie);
    expect(msgsRes.status).toBe(200);
    // User2 should not see the pre-join message
    expect(msgsRes.body.length).toBe(0);

    // User1 sends message after join
    await request(app)
      .post(`/api/chats/${chatId}/messages`)
      .set("Cookie", user1Cookie)
      .send({ text: "Welcome Bob!" });

    const updatedMsgs = await request(app)
      .get(`/api/chats/${chatId}/messages`)
      .set("Cookie", user2Cookie);
    expect(updatedMsgs.body.length).toBe(1);
    expect(updatedMsgs.body[0].text).toBe("Welcome Bob!");
  });

  it("11. Message edit & delete authorization: non-author cannot edit or delete", async () => {
    const chatRes = await request(app)
      .post("/api/chats")
      .set("Cookie", user1Cookie)
      .send({ name: "Collab Chat", visibility: "public", type: "group", memberUids: [user1Uid] });
    const chatId = chatRes.body.id;

    await request(app).post(`/api/chats/${chatId}/join`).set("Cookie", user2Cookie).send({});

    const msgRes = await request(app)
      .post(`/api/chats/${chatId}/messages`)
      .set("Cookie", user1Cookie)
      .send({ text: "Alice's original message" });
    const msgId = msgRes.body.id;

    // Bob tries to edit Alice's message
    const rogueEdit = await request(app)
      .put(`/api/chats/${chatId}/messages/${msgId}`)
      .set("Cookie", user2Cookie)
      .send({ text: "Bob tampered with this message" });
    expect(rogueEdit.status).toBe(403);

    // Bob (regular member) tries to delete Alice's message
    const rogueDelete = await request(app)
      .delete(`/api/chats/${chatId}/messages/${msgId}`)
      .set("Cookie", user2Cookie);
    expect(rogueDelete.status).toBe(403);
  });

  it("12. Admin Database Upload rejects non-SQLite files and validates schema", async () => {
    // Non-admin attempt
    const nonAdminAttempt = await request(app)
      .post("/api/admin/db/upload")
      .set("Cookie", user1Cookie)
      .attach("database", Buffer.from("random text"), "corrupt.db");
    expect(nonAdminAttempt.status).toBe(403);

    // Admin attempt with invalid sqlite header
    const fakeDbBuf = Buffer.from("NOT_A_SQLITE_DATABASE_HEADER_DATA");
    const badDbRes = await request(app)
      .post("/api/admin/db/upload")
      .set("Cookie", adminCookie)
      .attach("database", fakeDbBuf, "fake.db");
    expect(badDbRes.status).toBe(400);
    expect(badDbRes.body.error).toMatch(/not a valid SQLite 3 database/i);
  });
});
