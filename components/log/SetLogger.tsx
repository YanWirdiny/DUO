"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type LogExercise = {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  lastWeight: number | null;
  lastReps: number | null;
};

type SetInput = { weight: string; reps: string };

export function SetLogger({
  date,
  scheduleDayId,
  exercises,
  initialSets,
  hasExistingLog,
}: {
  date: string;
  scheduleDayId: string | null;
  exercises: LogExercise[];
  initialSets: { exerciseId: string; setNumber: number; weight: number; reps: number }[];
  hasExistingLog: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, SetInput[]>>(() => {
    const map: Record<string, SetInput[]> = {};
    for (const ex of exercises) {
      const existing = initialSets
        .filter((s) => s.exerciseId === ex.id)
        .sort((a, b) => a.setNumber - b.setNumber);
      const count = Math.max(ex.targetSets, existing.length, 1);
      map[ex.id] = Array.from({ length: count }, (_, i) => ({
        weight: existing[i] ? String(existing[i].weight) : "",
        reps: existing[i] ? String(existing[i].reps) : "",
      }));
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(exerciseId: string, index: number, patch: Partial<SetInput>) {
    setRows((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function addRow(exerciseId: string) {
    setRows((prev) => ({ ...prev, [exerciseId]: [...prev[exerciseId], { weight: "", reps: "" }] }));
  }

  function removeRow(exerciseId: string, index: number) {
    setRows((prev) => ({ ...prev, [exerciseId]: prev[exerciseId].filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const sets = Object.entries(rows).flatMap(([exerciseId, exRows]) =>
      exRows
        .map((r, i) => ({ exerciseId, setNumber: i + 1, weight: Number(r.weight) || 0, reps: Number(r.reps) || 0 }))
        .filter((r) => r.reps > 0 || r.weight > 0)
    );

    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, scheduleDayId, sets }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save your workout.");
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleDelete() {
    setSaving(true);
    await fetch(`/api/workouts/${date}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {exercises.map((ex) => (
        <Card key={ex.id}>
          <CardHeader>
            <CardTitle className="text-text">{ex.name}</CardTitle>
            {ex.lastWeight != null && (
              <span className="text-xs text-text-faint">
                Last: {ex.lastWeight} × {ex.lastReps}
              </span>
            )}
          </CardHeader>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-xs text-text-faint px-0.5">
              <span>Set</span>
              <span>Weight</span>
              <span>Reps</span>
              <span />
            </div>
            {rows[ex.id]?.map((row, i) => (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2">
                <span className="text-sm font-medium text-text-faint">{i + 1}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={ex.lastWeight != null ? String(ex.lastWeight) : "0"}
                  value={row.weight}
                  onChange={(e) => updateRow(ex.id, i, { weight: e.target.value })}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={String(ex.targetReps)}
                  value={row.reps}
                  onChange={(e) => updateRow(ex.id, i, { reps: e.target.value })}
                />
                <button
                  onClick={() => removeRow(ex.id, i)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-text-faint hover:bg-danger-soft hover:text-danger"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => addRow(ex.id)}
              className="mt-1 flex items-center gap-1 self-start rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
            >
              <Plus size={14} /> Add set
            </button>
          </div>
        </Card>
      ))}

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        {hasExistingLog && (
          <Button variant="danger" size="lg" onClick={handleDelete} disabled={saving}>
            Remove log
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save workout"}
        </Button>
      </div>
    </div>
  );
}
