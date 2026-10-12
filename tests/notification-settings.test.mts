// Renders the NotificationSettings client component in jsdom and drives it like
// a user would. Browser push APIs come in through the component's `env` prop.
import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// jsdom globals must exist before React DOM loads.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (!(key in globalThis)) g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
(dom.window as unknown as { fetch: unknown }).fetch = (...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args);

const { createElement } = await import("react");
const { render, screen, fireEvent, waitFor, cleanup, act } = await import("@testing-library/react");
const { NotificationSettings } = await import("@/components/settings/NotificationSettings");
type PushEnv = import("@/lib/push-client").PushEnv;

const VAPID_KEY = "B" + "A".repeat(86);
const PREFS = { gymDayEnabled: true, gymDayTime: "08:00", logReminderEnabled: true, logReminderTime: "20:00" };

function fakeEnv(opts: { subscribed?: boolean; requestResult?: NotificationPermission; getRegistrationThrows?: boolean } = {}) {
  let subscribed = opts.subscribed ?? false;
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: {} }),
    unsubscribe: async () => {
      subscribed = false;
      return true;
    },
  };
  const registration = {
    pushManager: {
      getSubscription: async () => (subscribed ? subscription : null),
      subscribe: async () => {
        subscribed = true;
        return subscription;
      },
    },
  };
  const notification = {
    permission: "default" as NotificationPermission,
    requestPermission: async () => {
      notification.permission = opts.requestResult ?? "granted";
      return notification.permission;
    },
  };
  const env: PushEnv = {
    serviceWorker: {
      ready: Promise.resolve(registration),
      getRegistration: async () => {
        if (opts.getRegistrationThrows) throw new Error("SecurityError");
        return registration;
      },
    },
    Notification: notification,
    hasPushManager: true,
    fetch: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch,
  };
  return env;
}

function renderSettings(props: Partial<Parameters<typeof NotificationSettings>[0]> = {}) {
  return render(
    createElement(NotificationSettings, { vapidPublicKey: VAPID_KEY, preferences: PREFS, timezone: "Europe/Paris", ...props })
  );
}

const deviceSwitch = () => screen.getByRole("switch", { name: "Notifications on this device" });

/** Replaces global fetch (used for the preferences PATCH) with a scripted one. */
function mockPatch(...responses: Response[]) {
  return mock.method(globalThis, "fetch", async () => responses.shift() ?? new Response("{}", { status: 500 }));
}

afterEach(() => {
  cleanup();
  mock.restoreAll();
});

describe("NotificationSettings — this device", () => {
  test("in a browser without push (the default env here), explains and disables the switch", async () => {
    renderSettings();
    await screen.findByText(/This browser can't receive notifications/);
    assert.equal((deviceSwitch() as HTMLButtonElement).disabled, true);
    screen.getByText(/Times are in your timezone \(Europe\/Paris\)/);
  });

  test("disabled with a server message when VAPID isn't configured", async () => {
    renderSettings({ vapidPublicKey: null, env: fakeEnv() });
    await screen.findByText("Notifications aren't set up on the server yet.");
    await waitFor(() => assert.equal((deviceSwitch() as HTMLButtonElement).disabled, true));
  });

  test("turn on, then off", async () => {
    renderSettings({ env: fakeEnv() });
    await waitFor(() => assert.equal((deviceSwitch() as HTMLButtonElement).disabled, false));
    assert.equal(deviceSwitch().getAttribute("aria-checked"), "false");
    screen.getByText("Get reminders on this device.");

    fireEvent.click(deviceSwitch());
    await screen.findByText("Notifications are on here.");
    assert.equal(deviceSwitch().getAttribute("aria-checked"), "true");

    fireEvent.click(deviceSwitch());
    await screen.findByText("Get reminders on this device.");
    assert.equal(deviceSwitch().getAttribute("aria-checked"), "false");
  });

  test("shows as on when this browser is already subscribed", async () => {
    renderSettings({ env: fakeEnv({ subscribed: true }) });
    await screen.findByText("Notifications are on here.");
  });

  test("a refused permission shows the error and the blocked hint", async () => {
    renderSettings({ env: fakeEnv({ requestResult: "denied" }) });
    await waitFor(() => assert.equal((deviceSwitch() as HTMLButtonElement).disabled, false));
    fireEvent.click(deviceSwitch());
    await screen.findByText(/Notifications are blocked\. Allow them for Duo/);
    screen.getByText(/Notifications are blocked for Duo\. Allow them in your browser settings/);
    assert.equal(deviceSwitch().getAttribute("aria-checked"), "false");
  });

  test("treats a failing subscription lookup as off", async () => {
    renderSettings({ env: fakeEnv({ getRegistrationThrows: true }) });
    await waitFor(() => assert.equal((deviceSwitch() as HTMLButtonElement).disabled, false));
    assert.equal(deviceSwitch().getAttribute("aria-checked"), "false");
  });

  test("ignores a lookup that finishes after unmount", async () => {
    let release!: () => void;
    const env = fakeEnv();
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = env.serviceWorker!.getRegistration;
    env.serviceWorker!.getRegistration = async () => {
      await gate;
      return original();
    };
    const { unmount } = renderSettings({ env });
    unmount();
    await act(async () => release());
  });
});

describe("NotificationSettings — reminders", () => {
  const ok = (preferences: typeof PREFS) => new Response(JSON.stringify({ preferences }), { status: 200 });

  test("toggling a reminder PATCHes just that field", async () => {
    const fetchMock = mockPatch(ok({ ...PREFS, gymDayEnabled: false }));
    renderSettings({ env: fakeEnv() });
    const toggle = screen.getByRole("switch", { name: "Enable gym day" });

    fireEvent.click(toggle);
    await waitFor(() => assert.equal(toggle.getAttribute("aria-checked"), "false"));
    const [url, init] = fetchMock.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "/api/notifications/preferences");
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body as string), { gymDayEnabled: false });
    // A disabled reminder's time can't be edited.
    assert.equal((screen.getByLabelText("Gym day time") as HTMLInputElement).disabled, true);
  });

  test("a changed time is saved on blur; an unchanged or invalid one is not", async () => {
    const fetchMock = mockPatch(ok({ ...PREFS, logReminderTime: "21:30" }));
    renderSettings({ env: fakeEnv() });
    const input = () => screen.getByLabelText("Log reminder time") as HTMLInputElement;

    fireEvent.blur(input()); // unchanged
    fireEvent.change(input(), { target: { value: "" } }); // cleared → invalid
    fireEvent.blur(input());
    assert.equal(input().value, "20:00");
    assert.equal(fetchMock.mock.callCount(), 0);

    fireEvent.change(input(), { target: { value: "21:30" } });
    fireEvent.blur(input());
    await waitFor(() => assert.equal(fetchMock.mock.callCount(), 1));
    const [, init] = fetchMock.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), { logReminderTime: "21:30" });
    await waitFor(() => assert.equal(input().value, "21:30"));
  });

  test("a rejected save reverts the field and shows the server's message", async () => {
    mockPatch(new Response(JSON.stringify({ error: "Invalid notification settings." }), { status: 400 }));
    renderSettings({ env: fakeEnv() });
    const input = () => screen.getByLabelText("Gym day time") as HTMLInputElement;

    fireEvent.change(input(), { target: { value: "09:15" } });
    fireEvent.blur(input());
    await screen.findByText("Invalid notification settings.");
    await waitFor(() => assert.equal(input().value, "08:00"));
  });

  test("a broken response falls back to a generic message", async () => {
    mockPatch(new Response("<html>", { status: 502 }));
    renderSettings({ env: fakeEnv() });
    fireEvent.click(screen.getByRole("switch", { name: "Enable log reminder" }));
    await screen.findByText("Couldn't save your notification settings.");
    assert.equal(screen.getByRole("switch", { name: "Enable log reminder" }).getAttribute("aria-checked"), "true");
  });
});
