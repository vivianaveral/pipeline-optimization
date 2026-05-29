"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect password.");
        setPassword("");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: 24,
    }}>
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        padding: "40px 36px",
        width: "100%",
        maxWidth: 380,
      }}>
        {/* Logo / wordmark */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}>
            <div style={{
              width: 36, height: 36,
              background: "var(--old)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>B</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
              BruntWork
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Sales Initiative KPI Tracker
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter dashboard password"
            autoFocus
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
              borderRadius: 8,
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
              marginBottom: 8,
              transition: "border-color 0.15s",
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12, fontWeight: 500 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn primary"
            style={{ width: "100%", marginTop: error ? 0 : 8, justifyContent: "center" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 20 }}>
          Internal use only · BruntWork RevOps
        </p>
      </div>
    </div>
  );
}
