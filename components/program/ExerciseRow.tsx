"use client";

import { useState } from "react";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

export type ExerciseData = {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
};

export function ExerciseRow({
  exercise,
  onUpdate,
  onDelete,
}: {
  exercise: ExerciseData;
  onUpdate: (id: string, patch: Partial<ExerciseData>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(exercise.targetSets);
  const [reps, setReps] = useState(exercise.targetReps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exercises/${exercise.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetSets: sets, targetReps: reps }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save changes.");
      return;
    }
    onUpdate(exercise.id, { name, targetSets: sets, targetReps: reps });
    setEditing(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exercises/${exercise.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't delete exercise.");
      return;
    }
    onDelete(exercise.id);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Input
          type="number"
          value={sets}
          onChange={(e) => setSets(Number(e.target.value))}
          className="w-14 text-center"
        />
        <span className="text-text-faint">×</span>
        <Input
          type="number"
          value={reps}
          onChange={(e) => setReps(Number(e.target.value))}
          className="w-14 text-center"
        />
        <button disabled={busy} onClick={save} className="rounded-lg p-2 text-success hover:bg-success-soft">
          <Check size={16} />
        </button>
        <button onClick={() => setEditing(false)} className="rounded-lg p-2 text-text-muted hover:bg-surface-raised">
          <X size={16} />
        </button>
        {error && <p className="w-full text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{exercise.name}</span>
        <div className="flex items-center gap-1 text-sm text-text-faint">
          <span>
            {exercise.targetSets} × {exercise.targetReps}
          </span>
          <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 hover:bg-surface-raised hover:text-text">
            <Pencil size={14} />
          </button>
          <button disabled={busy} onClick={remove} className="rounded-lg p-1.5 hover:bg-danger-soft hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
