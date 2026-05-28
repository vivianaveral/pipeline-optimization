"use client";
import { useState } from "react";
import { EXCLUDED_CONTACTS } from "@/config/exclusions";

export default function ExclusionsPanel() {
  const [open, setOpen] = useState(false);

  if (EXCLUDED_CONTACTS.length === 0) return null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        style={{
          width: "100%",
          padding: "9px 16px",
          background: "none",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontSize: "12px",
          color: "var(--muted)",
          textAlign: "left",
        }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontWeight: 500 }}>
          ⊘ Applied exclusions ({EXCLUDED_CONTACTS.length} contact{EXCLUDED_CONTACTS.length !== 1 ? "s" : ""})
        </span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 16px 12px",
            borderTop: "1px solid var(--border)",
            fontSize: "11px",
          }}
        >
          {EXCLUDED_CONTACTS.map((c) => (
            <div key={c.contactId} style={{ paddingTop: 10 }}>
              <span
                style={{
                  background: "var(--dangerl)",
                  color: "var(--danger)",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "4px",
                  marginRight: "8px",
                }}
              >
                EXCLUDED
              </span>
              <strong>
                {c.name} ({c.contactId})
              </strong>{" "}
              — {c.reason}
              <span style={{ color: "var(--muted)", marginLeft: 8 }}>Since {c.excludedSince}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
