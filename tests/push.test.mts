import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import {
  getVapidConfig,
  isAllowedPushEndpoint,
  isValidAuthSecret,
  isValidP256dh,
  sendPush,
} from "@/lib/push";
import { isAuthorizedCronRequest, isCronConfigured, MIN_CRON_SECRET_LENGTH } from "@/lib/cron-auth";

// Real, well-formed keys (generated once with web-push) so validation sees real shapes.
const VAPID = webpush.generateVAPIDKeys();
const P256DH = "B" + "A".repeat(86);
const AUTH = "A".repeat(22);

describe("isAllowedPushEndpoint", () => {
  test("accepts the push services browsers use", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGx",
      "https://api.push.apple.com/3/device/x",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://FCM.GOOGLEAPIS.COM/fcm/send/x",
    ]) {
      assert.ok(isAllowedPushEndpoint(url), url);
    }
  });

  test("rejects anything that could aim the server elsewhere (SSRF)", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/x", // not https
      "https://fcm.googleapis.com:8443/x", // explicit port
      "https://user:pw@fcm.googleapis.com/x", // credentials
      "https://user@fcm.googleapis.com/x",
      "https://evil.example.com/x",
      "https://fcm.googleapis.com.evil.com/x", // suffix trick
      "https://evilfcm.googleapis.com/x",
      "https://notify.windows.com.evil.com/x",
      "https://push.apple.com/x", // bare domain of a "." entry isn't a subdomain
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
      "",
      "https://fcm.googleapis.com/" + "a".repeat(1100), // too long
    ]) {
      assert.ok(!isAllowedPushEndpoint(url), url);
    }
  });
});

describe("subscription key validation", () => {
  test("p256dh must be 87 base64url chars (optional padding)", () => {
    assert.ok(isValidP256dh(P256DH));
    assert.ok(isValidP256dh(P256DH + "="));
    assert.ok(!isValidP256dh(P256DH.slice(1)));
    assert.ok(!isValidP256dh(P256DH.slice(1) + "+"));
    assert.ok(!isValidP256dh(""));
  });

  test("auth must be 22 base64url chars (optional padding)", () => {
    assert.ok(isValidAuthSecret(AUTH));
    assert.ok(isValidAuthSecret(AUTH + "=="));
    assert.ok(!isValidAuthSecret(AUTH + "A"));
    assert.ok(!isValidAuthSecret("A".repeat(21) + "/"));
  });
});

describe("getVapidConfig", () => {
  const env = { VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: "mailto:a@b.co" };

  test("returns trimmed keys when all three are valid", () => {
    assert.deepEqual(getVapidConfig({ ...env, VAPID_SUBJECT: " https://duo.example.com " }), {
      publicKey: VAPID.publicKey,
      privateKey: VAPID.privateKey,
      subject: "https://duo.example.com",
    });
    assert.ok(getVapidConfig(env));
  });

  test("fails closed when anything is missing or malformed", () => {
    assert.equal(getVapidConfig({}), null);
    assert.equal(getVapidConfig({ ...env, VAPID_PUBLIC_KEY: undefined }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_PRIVATE_KEY: "  " }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_SUBJECT: undefined }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_PUBLIC_KEY: "short" }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_PRIVATE_KEY: VAPID.privateKey + "A" }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_PRIVATE_KEY: "!".repeat(43) }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_SUBJECT: "http://insecure.example.com" }), null);
    assert.equal(getVapidConfig({ ...env, VAPID_SUBJECT: "mailto:nobody" }), null);
  });

  test("reads process.env by default", () => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      assert.equal(getVapidConfig()?.publicKey, VAPID.publicKey);
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});

describe("sendPush", () => {
  const target = { endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: P256DH, auth: AUTH };
  const payload = { title: "Gym day", body: "Go", url: "/", tag: "GYM_DAY" as const };
  const vapid = { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: "mailto:a@b.co" };

  afterEach(() => mock.restoreAll());

  test("sends the JSON payload with VAPID details, TTL and topic", async () => {
    const send = mock.method(webpush, "sendNotification", async () => ({ statusCode: 201, body: "", headers: {} }));
    assert.equal(await sendPush(target, payload, vapid), "sent");

    const [sub, body, options] = send.mock.calls[0].arguments;
    assert.deepEqual(sub, { endpoint: target.endpoint, keys: { p256dh: P256DH, auth: AUTH } });
    assert.deepEqual(JSON.parse(body as string), payload);
    assert.deepEqual(options, {
      vapidDetails: vapid,
      TTL: 4 * 60 * 60,
      urgency: "normal",
      topic: "GYM_DAY",
      timeout: 10_000,
    });
  });

  test("404 and 410 mean the subscription is gone", async () => {
    for (const statusCode of [404, 410]) {
      mock.method(webpush, "sendNotification", async () => {
        throw Object.assign(new Error("gone"), { statusCode });
      });
      assert.equal(await sendPush(target, payload, vapid), "gone");
      mock.restoreAll();
    }
  });

  test("other errors are failures and never throw", async () => {
    mock.method(webpush, "sendNotification", async () => {
      throw Object.assign(new Error("server"), { statusCode: 500 });
    });
    assert.equal(await sendPush(target, payload, vapid), "failed");
    mock.restoreAll();
    mock.method(webpush, "sendNotification", async () => {
      throw null;
    });
    assert.equal(await sendPush(target, payload, vapid), "failed");
  });
});

describe("cron auth", () => {
  const secret = "s".repeat(MIN_CRON_SECRET_LENGTH);

  test("accepts exactly `Bearer <secret>`", () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
  });

  test("rejects wrong, missing or malformed headers", () => {
    for (const header of [null, "", secret, `bearer ${secret}`, `Bearer ${secret}x`, `Bearer  ${secret}`, "Bearer "]) {
      assert.equal(isAuthorizedCronRequest(header, secret), false, String(header));
    }
  });

  test("stays closed when CRON_SECRET is unset or too short, even if the header matches", () => {
    assert.equal(isCronConfigured(undefined), false);
    assert.equal(isCronConfigured(""), false);
    assert.equal(isCronConfigured("x".repeat(MIN_CRON_SECRET_LENGTH - 1)), false);
    assert.equal(isAuthorizedCronRequest("Bearer short", "short"), false);
    assert.equal(isAuthorizedCronRequest("Bearer ", ""), false);
    assert.equal(isAuthorizedCronRequest("Bearer x", undefined), false);
  });

  test("reads process.env.CRON_SECRET by default", () => {
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;
    try {
      assert.equal(isCronConfigured(), true);
      assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`), true);
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });
});
