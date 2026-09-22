"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ExerciseData } from "./ExerciseRow";

export function AddExerciseForm({
  scheduleDayId,
  onAdd,
}: {
  scheduleDayId: string;
  onAdd: (exercise: ExerciseData) => void;
}) {
  const [name, setName] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleDayId, name: name.trim(), targetSets: sets, targetReps: reps }),
    });
    const data = await res.json();
    if (res.ok) {
      onAdd(data.exercise);
      setName("");
      setSets(3);
      setReps(10);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
      <Input
        placeholder="Exercise name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
      />
      <Input
        type="number"
        value={sets}
        onChange={(e) => setSets(Number(e.target.value))}
        className="w-14 text-center"
        aria-label="Target sets"
      />
      <span className="text-text-faint">×</span>
      <Input
        type="number"
        value={reps}
        onChange={(e) => setReps(Number(e.target.value))}
        className="w-14 text-center"
        aria-label="Target reps"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
        <Plus size={16} />
      </Button>
    </form>
  );
}
