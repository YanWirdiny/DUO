"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { ExerciseRow, type ExerciseData } from "./ExerciseRow";
import { AddExerciseForm } from "./AddExerciseForm";
import { cn } from "@/lib/utils";
import type { Weekday } from "@prisma/client";

export type DayData = {
  id: string;
  weekday: Weekday;
  isGymDay: boolean;
  label: string | null;
  exercises: ExerciseData[];
};

export function DayCard({ weekdayLabel, day, defaultOpen }: { weekdayLabel: string; day: DayData; defaultOpen?: boolean }) {
  const [isGymDay, setIsGymDay] = useState(day.isGymDay);
  const [label, setLabel] = useState(day.label ?? "");
  const [exercises, setExercises] = useState(day.exercises);
  const [open, setOpen] = useState(!!defaultOpen);
  const [savingLabel, setSavingLabel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchSchedule(patch: { isGymDay?: boolean; label?: string }) {
    const res = await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: day.weekday, isGymDay, label, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save schedule changes.");
      return false;
    }
    setError(null);
    return true;
  }

  async function toggleGymDay(value: boolean) {
    setIsGymDay(value);
    const ok = await patchSchedule({ isGymDay: value });
    if (!ok) setIsGymDay(!value);
  }

  async function saveLabel() {
    setSavingLabel(true);
    await patchSchedule({ label });
    setSavingLabel(false);
  }

  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Switch checked={isGymDay} onChange={toggleGymDay} />
          <div>
            <p className="text-sm font-semibold">{weekdayLabel}</p>
            <p className="text-xs text-text-faint">
              {isGymDay ? label || "Gym day" : "Rest day"}
              {isGymDay && exercises.length > 0 ? ` · ${exercises.length} exercises` : ""}
            </p>
          </div>
        </div>
        <ChevronDown size={18} className={cn("text-text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && isGymDay && (
        <div className="border-t border-border px-4 pb-4">
          <div className="pt-3">
            <Input
              placeholder="Day label, e.g. Push Day"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              disabled={savingLabel}
            />
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          </div>

          <div className="mt-1 divide-y divide-border">
            {exercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                onUpdate={(id, patch) =>
                  setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
                }
                onDelete={(id) => setExercises((prev) => prev.filter((e) => e.id !== id))}
              />
            ))}
          </div>

          <AddExerciseForm
            scheduleDayId={day.id}
            onAdd={(exercise) => setExercises((prev) => [...prev, exercise])}
          />
        </div>
      )}
    </Card>
  );
}
