"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form onSubmit={handleSubmit} style={{ width: 320, background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: 32 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>BruntWork RevOps</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: "100%", padding: "8px 12px", border: "0.5px solid #ccc", borderRadius: 4, marginBottom: 12, fontSize: 14 }}
        />
        {error && <p style={{ color: "#c00", marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "8px 12px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 4, fontSize: 14 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
