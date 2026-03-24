"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid PIN");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-[var(--text)] mb-1">Weather Bot</h1>
        <p className="text-sm text-[var(--dim)] mb-6">Enter your dashboard PIN</p>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          autoFocus
          className="w-full bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] rounded-lg px-4 py-3 text-lg tracking-widest text-center focus:outline-none focus:border-[var(--blue)] mb-4"
        />

        {error && (
          <p className="text-[var(--red)] text-sm text-center mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !pin}
          className="w-full bg-[var(--blue)] hover:bg-[var(--blue)]/80 text-white font-medium rounded-lg px-4 py-3 transition disabled:opacity-40"
        >
          {loading ? "Verifying..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
