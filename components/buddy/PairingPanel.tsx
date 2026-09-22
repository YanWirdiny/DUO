"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

/** Two-way buddy pairing UI: generate a shareable code, or redeem one from a buddy. */
export function PairingPanel() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Requests a new pairing code (15-minute TTL) for this user. */
  async function generateCode() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/buddy/generate-code", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Couldn't generate a code.");
    else setCode(data.code);
    setBusy(false);
  }

  /** Copies the generated code to the clipboard, briefly showing a "copied" state. */
  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Redeems the entered code, pairing with its owner on success. */
  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/buddy/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: enteredCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't connect.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Share your code</CardTitle>
        </CardHeader>
        {code ? (
          <div className="flex items-center justify-between rounded-2xl bg-accent-soft px-4 py-4">
            <span className="text-2xl font-semibold tracking-[0.3em] text-accent-strong">{code}</span>
            <button onClick={copyCode} className="rounded-lg p-2 text-accent-strong hover:bg-white/40">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        ) : (
          <Button onClick={generateCode} disabled={busy} variant="secondary" className="w-full">
            Generate a code
          </Button>
        )}
        {code && <p className="mt-2 text-xs text-text-faint">Expires in 15 minutes. Share it with your buddy.</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Have a code?</CardTitle>
        </CardHeader>
        <form onSubmit={handleConnect} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="code">Enter your buddy&apos;s code</Label>
            <Input
              id="code"
              value={enteredCode}
              onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              className="tracking-[0.2em]"
            />
          </div>
          <Button type="submit" disabled={busy || !enteredCode}>
            Connect
          </Button>
        </form>
      </Card>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
