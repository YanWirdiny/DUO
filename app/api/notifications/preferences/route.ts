import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { updateNotificationPreferences } from "@/lib/notifications";
import { preferencesToDto, TIME_PATTERN, timeToMinute, type NotificationPreferences } from "@/lib/notification-rules";

const schema = z
  .strictObject({
    gymDayEnabled: z.boolean().optional(),
    gymDayTime: z.string().regex(TIME_PATTERN).optional(),
    logReminderEnabled: z.boolean().optional(),
    logReminderTime: z.string().regex(TIME_PATTERN).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

/** Updates which reminders the user gets and at what local time (any subset). */
export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification settings." }, { status: 400 });

  const { gymDayEnabled, gymDayTime, logReminderEnabled, logReminderTime } = parsed.data;
  const patch: Partial<NotificationPreferences> = { gymDayEnabled, logReminderEnabled };
  if (gymDayTime) patch.gymDayMinute = timeToMinute(gymDayTime);
  if (logReminderTime) patch.logReminderMinute = timeToMinute(logReminderTime);

  const preferences = await updateNotificationPreferences(userId, patch);
  return NextResponse.json({ preferences: preferencesToDto(preferences) });
}
