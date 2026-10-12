# Duo — Function-level UML

Who calls what, function by function. [`ARCHITECTURE.md`](./ARCHITECTURE.md) explains features at the module level; this file shows the wiring underneath.

**Conventions**
- One section per feature, numbered like the feature's section in ARCHITECTURE.md §9.
- `classDiagram`: each module is a class and its exported functions are methods (`+` exported, `-` private). Arrows mean "calls" (`..>`) or "uses type/constant" (`-->`).
- `sequenceDiagram`: one function's call chain, top to bottom.
- Diagrams are [Mermaid](https://mermaid.js.org/) and render on GitHub and in VS Code.

## Contents

- [9.7 Home](#97-home)
  - [Module map](#module-map-home)
  - [HomePage render](#homepage-render)
  - [Function index](#function-index-home)
- [9.12 Notifications](#912-notifications)
  - [Module map](#module-map)
  - [Settings page → NotificationSettings](#settings-page--notificationsettings)
  - [enablePush / disablePush](#enablepush--disablepush)
  - [POST /api/notifications/subscriptions → saveSubscription](#post-apinotificationssubscriptions--savesubscription)
  - [PATCH /api/notifications/preferences](#patch-apinotificationspreferences)
  - [POST /api/cron/notifications → sendDueNotifications](#post-apicronnotifications--sendduenotifications)
  - [Service worker](#service-worker)
  - [Function index](#function-index)

> The other features (§9.1–9.6, §9.8–9.11) don't have function-level diagrams here yet. Add each one as its own section, following the same conventions.

---

## 9.7 Home

<a id="module-map-home"></a>
### Module map

```mermaid
classDiagram
    class HomePage {
        <<server component, app/(app)/page.tsx>>
        +default HomePage()
    }
    class home {
        <<lib/home.ts>>
        +HOME EFFORT_BARS = 7
        +buildWeekStrip(today, weekStart, gymWeekdays, loggedDates) WeekDay[]
        +summarizeEffort(sessions, weekStart) EffortSummary
        +formatVolume(volume) string
        +loadSessionVolumes(userId) SessionVolume[]
        +weeklyScoreChange(userId, weekStart) number
    }
    class dates {
        <<lib/dates.ts>>
        +todayInTz()
        +startOfWeek()
        +addDays()
        +weekdayOf()
        +isAfter()
    }
    class HomeCard {
        <<components/home/HomeCard.tsx>>
        +HomeCard()
        +HomeLabel()
        +Trend(value, suffix)
    }
    class WeekStrip
    class GymScoreCard
    class BuddyScoreCard
    class EffortCard {
        -chartLabel(bars) string
    }
    class ActivityTimeline
    class LateLogBanner
    HomePage ..> home : buildWeekStrip, summarizeEffort, loadSessionVolumes, weeklyScoreChange
    HomePage ..> dates : todayInTz, startOfWeek, addDays
    HomePage ..> WeekStrip
    HomePage ..> GymScoreCard
    HomePage ..> BuddyScoreCard
    HomePage ..> EffortCard
    HomePage ..> ActivityTimeline
    HomePage ..> LateLogBanner
    home ..> dates : addDays, weekdayOf, isAfter
    GymScoreCard ..> HomeCard : Trend
    BuddyScoreCard ..> HomeCard : Trend
    EffortCard ..> HomeCard : Trend
    EffortCard ..> home : formatVolume, HOME
    WeekStrip --> home : WeekDay type
```

### HomePage render

```mermaid
sequenceDiagram
    participant P as HomePage
    participant A as getCurrentUser
    participant H as lib/home
    participant DB as Prisma
    participant S as ensureScoresUpToDate
    P->>A: current user
    P->>P: today = todayInTz(tz), weekStart = startOfWeek(today)
    par Promise.all
        P->>DB: scheduleDay.findMany (gym weekdays)
        P->>DB: workoutLog.findMany (completed, date >= weekStart)
        P->>DB: getBuddyId, last 6 scoreEvents
        P->>P: getLateLogEligibility(yesterday)
        P->>H: weeklyScoreChange(user, weekStart)
        H->>DB: scoreEvent.aggregate sum(points)
        P->>H: loadSessionVolumes(user)
        H->>DB: queryRaw SUM(weight*reps) GROUP BY WorkoutLog
    end
    P->>H: buildWeekStrip(today, weekStart, gymWeekdays, loggedDates)
    opt paired
        P->>S: ensureScoresUpToDate(buddyId)
        P->>DB: user.findUnique(buddy)
        P->>H: weeklyScoreChange(buddy, startOfWeek(buddy today))
    end
    P->>H: summarizeEffort(sessions, weekStart)
    P-->>P: render WeekStrip, GymScoreCard, LateLogBanner?, BuddyScoreCard, EffortCard, ActivityTimeline
```

<a id="function-index-home"></a>
### Function index

| Function | Module | Called by |
|---|---|---|
| `buildWeekStrip` | home | HomePage |
| `summarizeEffort` | home | HomePage |
| `formatVolume` | home | EffortCard (summary + `chartLabel`) |
| `loadSessionVolumes` | home | HomePage |
| `weeklyScoreChange` | home | HomePage (user and buddy) |
| `startOfWeek` | dates | HomePage |
| `Trend` | components/home/HomeCard | GymScoreCard, BuddyScoreCard, EffortCard |
| `HomeCard`, `HomeLabel` | components/home/HomeCard | every home card, LateLogBanner |
| `chartLabel` (private) | components/home/EffortCard | EffortCard |

---

## 9.12 Notifications

### Module map

```mermaid
classDiagram
    direction LR

    class notification_rules["lib/notification-rules.ts (pure)"] {
        +NOTIFICATIONS
        +DEFAULT_PREFERENCES
        +TIME_PATTERN
        +minuteToTime(minute) string
        +timeToMinute(time) number
        +preferencesToDto(prefs) NotificationPreferencesDto
        +isInSendWindow(minute, target) boolean
        +dueReminders(ctx) NotificationType[]
        +buildReminder(type, ctx) PushPayload
    }

    class notifications["lib/notifications.ts"] {
        +getNotificationPreferences(userId)
        +updateNotificationPreferences(userId, patch)
        +saveSubscription(userId, sub)
        +removeSubscription(userId, endpoint)
        +countSubscriptions(userId)
        +sendDueNotifications(send, now) SweepResult
        -claimDelivery(userId, type, date) boolean
    }

    class push["lib/push.ts (server)"] {
        +PUSH_SERVICE_HOSTS
        +isAllowedPushEndpoint(endpoint) boolean
        +isValidP256dh(key) boolean
        +isValidAuthSecret(key) boolean
        +getVapidConfig(env) VapidConfig|null
        +sendPush(target, payload, vapid) SendResult
    }

    class cron_auth["lib/cron-auth.ts"] {
        +MIN_CRON_SECRET_LENGTH
        +isCronConfigured(secret) boolean
        +isAuthorizedCronRequest(authorization, secret) boolean
    }

    class push_client["lib/push-client.ts (browser)"] {
        +browserPushEnv() PushEnv
        +urlBase64ToUint8Array(base64Url) Uint8Array
        +pushSupport(env) PushSupport
        +currentSubscription(env)
        +enablePush(env, vapidPublicKey, timeoutMs) PushResult
        +disablePush(env) PushResult
        -withTimeout(promise, ms)
        -errorFrom(res, fallback)
    }

    class dates["lib/dates.ts"] {
        +nowInTz(timezone, now)
        +dateStrToUtcMidnight(dateStr)
        +weekdayOf(dateStr)
    }

    class worker_push["worker/push.ts (service worker)"] {
        +safeAppPath(url) string
        +toNotification(data)
        +focusOrOpen(scope, path)
        +registerPushHandlers(scope)
        -text(value, max)
    }

    class route_prefs["PATCH /api/notifications/preferences"]
    class route_subs["POST|DELETE /api/notifications/subscriptions"]
    class route_cron["POST /api/cron/notifications"]
    class settings_page["app/(app)/settings/page.tsx"]
    class NotificationSettings["components/settings/NotificationSettings.tsx"]
    class notify_cron["scripts/notify-cron.mjs"] {
        +triggerSweep(appUrl, secret, fetchImpl)
    }
    class web_push["web-push (npm)"] {
        +sendNotification()
    }

    notifications ..> notification_rules : dueReminders, buildReminder
    notifications ..> dates : nowInTz, weekdayOf
    notifications --> push : PushTarget, SendResult types
    push --> notification_rules : PushPayload type
    push ..> web_push : sendNotification

    route_prefs ..> notifications : updateNotificationPreferences
    route_prefs ..> notification_rules : timeToMinute, preferencesToDto
    route_subs ..> notifications : saveSubscription, removeSubscription
    route_subs ..> push : getVapidConfig, isAllowedPushEndpoint, key checks
    route_cron ..> cron_auth : isCronConfigured, isAuthorizedCronRequest
    route_cron ..> push : getVapidConfig, sendPush
    route_cron ..> notifications : sendDueNotifications

    settings_page ..> notifications : getNotificationPreferences
    settings_page ..> push : getVapidConfig (public key only)
    settings_page ..> notification_rules : preferencesToDto
    settings_page --> NotificationSettings : props
    NotificationSettings ..> push_client : enablePush, disablePush, pushSupport
    NotificationSettings ..> route_prefs : fetch PATCH
    push_client ..> route_subs : fetch POST / DELETE
    notify_cron ..> route_cron : fetch POST + Bearer
```

### Settings page → NotificationSettings

```mermaid
sequenceDiagram
    participant P as SettingsPage (server)
    participant A as lib/auth
    participant N as lib/notifications
    participant PU as lib/push
    participant R as lib/notification-rules
    participant C as NotificationSettings (client)
    participant PC as lib/push-client

    P->>A: getCurrentUser()
    P->>N: getNotificationPreferences(user.id)
    N-->>P: row ?? DEFAULT_PREFERENCES
    P->>PU: getVapidConfig()
    PU-->>P: {publicKey,…} | null
    P->>R: preferencesToDto(prefs)
    P->>C: props {vapidPublicKey, preferences, timezone}
    Note over C: after hydration (useEffect)
    C->>PC: browserPushEnv()
    C->>PC: pushSupport(env)
    alt supported
        C->>PC: currentSubscription(env)
        PC-->>C: subscription | null → deviceOn
    end
```

### enablePush / disablePush

```mermaid
sequenceDiagram
    participant C as NotificationSettings.toggleDevice
    participant PC as lib/push-client
    participant B as Browser APIs (env)
    participant API as /api/notifications/subscriptions

    alt turning on
        C->>PC: enablePush(env, vapidPublicKey)
        PC->>PC: pushSupport(env) — unsupported → error
        PC->>B: Notification.requestPermission()
        PC->>PC: withTimeout(serviceWorker.ready, 10 s)
        PC->>B: pushManager.getSubscription() ?? subscribe({userVisibleOnly, urlBase64ToUint8Array(key)})
        PC->>API: POST subscription.toJSON()
        alt !res.ok
            PC->>B: subscription.unsubscribe()
            PC->>PC: errorFrom(res, fallback)
        end
    else turning off
        C->>PC: disablePush(env)
        PC->>PC: currentSubscription(env) — none → ok
        PC->>API: DELETE {endpoint}
        PC->>B: subscription.unsubscribe() (only after the server agreed)
    end
    PC-->>C: {ok} | {ok:false, error}
    C->>PC: pushSupport(env) (permission may have changed)
```

### POST /api/notifications/subscriptions → saveSubscription

```mermaid
sequenceDiagram
    participant R as POST route
    participant A as lib/auth
    participant PU as lib/push
    participant N as lib/notifications
    participant DB

    R->>A: getSessionUserId() — null → 401
    R->>PU: getVapidConfig() — null → 503
    R->>R: subscribeSchema.safeParse (strictObject)
    Note right of R: endpoint → isAllowedPushEndpoint<br/>p256dh → isValidP256dh<br/>auth → isValidAuthSecret
    R->>N: saveSubscription(userId, {endpoint, p256dh, auth})
    N->>DB: $transaction
    N->>DB: pushSubscription.findUnique(endpoint)
    alt owned by another user AND keys differ
        N-->>R: {ok:false, endpoint_taken} → 400 (same body as invalid)
    else not already the caller's
        N->>DB: count(userId) ≥ 5 → {ok:false, limit_reached} → 409
    end
    N->>DB: upsert by endpoint (userId, keys)
    N-->>R: {ok:true} → 200
```

`DELETE` calls `removeSubscription(userId, endpoint)`, which is `deleteMany({ where: { userId, endpoint } })`. It always answers `{ok:true}`.

### PATCH /api/notifications/preferences

```mermaid
sequenceDiagram
    participant R as PATCH route
    participant A as lib/auth
    participant RU as lib/notification-rules
    participant N as lib/notifications
    participant DB

    R->>A: getSessionUserId() — null → 401
    R->>R: strictObject + TIME_PATTERN + "≥ 1 key" — else 400
    R->>RU: timeToMinute(gymDayTime / logReminderTime)
    R->>N: updateNotificationPreferences(userId, patch)
    N->>DB: notificationPreference.upsert (create = DEFAULT_PREFERENCES + patch)
    R->>RU: preferencesToDto(saved)
    R-->>R: 200 {preferences}
```

### POST /api/cron/notifications → sendDueNotifications

```mermaid
sequenceDiagram
    participant S as scripts/notify-cron.mjs
    participant R as cron route
    participant CA as lib/cron-auth
    participant PU as lib/push
    participant N as sendDueNotifications
    participant D as lib/dates
    participant RU as lib/notification-rules
    participant DB
    participant WP as web-push

    S->>S: triggerSweep({appUrl, secret}) — https only
    S->>R: POST, Authorization: Bearer secret
    R->>CA: isCronConfigured() — false → console.warn
    R->>CA: isAuthorizedCronRequest(header) — false → 401
    R->>PU: getVapidConfig() — null → 503
    R->>N: sendDueNotifications((t, p) => sendPush(t, p, vapid))
    N->>DB: user.findMany(has subscriptions, with prefs, devices, buddy names)
    loop each user (try/catch → errors++)
        N->>D: nowInTz(timezone, now) → {date, minute}
        N->>D: dateStrToUtcMidnight(date), weekdayOf(date)
        N->>DB: scheduleDay (+ _count.exercises), workoutLog
        N->>N: continue unless gym day && not logged
        N->>RU: dueReminders({prefs ?? DEFAULT_PREFERENCES, minute})
        RU->>RU: isInSendWindow(minute, target) ×2
        loop each type
            N->>N: claimDelivery() → createMany skipDuplicates
            N->>RU: buildReminder(type, {date, label, exerciseCount, buddyName})
            loop each device not already gone
                N->>PU: send(device, payload) = sendPush
                PU->>WP: sendNotification(sub, JSON, {vapidDetails, TTL 4h, urgency, topic, timeout 10s})
                PU-->>N: sent | failed | gone (404/410)
                opt gone
                    N->>DB: pushSubscription.deleteMany(id)
                end
            end
        end
    end
    N->>DB: notificationDelivery.deleteMany(createdAt < now − 14 days)
    N-->>R: SweepResult
    R-->>S: 200 JSON → console.log (non-2xx → exit 1)
```

### Service worker

```mermaid
sequenceDiagram
    participant PS as Push service
    participant I as worker/index.ts
    participant W as worker/push.ts
    participant SW as self (registration, clients)

    I->>W: registerPushHandlers(self)
    W->>SW: addEventListener("push"), addEventListener("notificationclick")

    PS-)SW: push event
    SW->>W: push listener
    W->>W: toNotification(event.data) → text(), safeAppPath()
    W->>SW: event.waitUntil(registration.showNotification(title, options))

    SW->>W: notificationclick listener
    W->>SW: notification.close()
    W->>W: safeAppPath(notification.data.url)
    W->>W: focusOrOpen(scope, path)
    W->>SW: clients.matchAll({type:"window"}) → focus() existing tab, or clients.openWindow(origin + path)
```

### Function index

| Function | Module | Called by |
|---|---|---|
| `minuteToTime` | notification-rules | `preferencesToDto` |
| `timeToMinute` | notification-rules | preferences route |
| `preferencesToDto` | notification-rules | preferences route, settings page |
| `isInSendWindow` | notification-rules | `dueReminders` |
| `dueReminders` | notification-rules | `sendDueNotifications` |
| `buildReminder` | notification-rules | `sendDueNotifications` |
| `getNotificationPreferences` | notifications | settings page |
| `updateNotificationPreferences` | notifications | preferences route |
| `saveSubscription` | notifications | subscriptions route (POST) |
| `removeSubscription` | notifications | subscriptions route (DELETE) |
| `countSubscriptions` | notifications | tests (available for UI) |
| `claimDelivery` (private) | notifications | `sendDueNotifications` |
| `sendDueNotifications` | notifications | cron route |
| `isAllowedPushEndpoint`, `isValidP256dh`, `isValidAuthSecret` | push | subscriptions route (zod refine); `getVapidConfig` uses `isValidP256dh` |
| `getVapidConfig` | push | subscriptions route, cron route, settings page |
| `sendPush` | push | cron route (as the sweep's `send`) |
| `isCronConfigured`, `isAuthorizedCronRequest` | cron-auth | cron route |
| `nowInTz` | dates | `sendDueNotifications` |
| `browserPushEnv`, `pushSupport`, `currentSubscription` | push-client | NotificationSettings |
| `enablePush`, `disablePush` | push-client | NotificationSettings (`toggleDevice`) |
| `urlBase64ToUint8Array`, `withTimeout`, `errorFrom` | push-client | `enablePush` / `disablePush` |
| `registerPushHandlers` | worker/push | worker/index |
| `toNotification`, `safeAppPath`, `focusOrOpen` | worker/push | the push / notificationclick listeners |
| `triggerSweep` | scripts/notify-cron | its own CLI entry (Railway cron) |
