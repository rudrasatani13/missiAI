"use client";

import { useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";

interface MemorySearchProps {
  query: string;
  onChange: (q: string) => void;
  resultCount: number;
}

export function MemorySearch({
  query,
  onChange,
  resultCount,
}: MemorySearchProps) {
  const [inputValue, setInputValue] = useState(query);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external query changes back to local input
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const handleChange = (value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(value);
    }, 300);
  };

  const handleClear = () => {
    setInputValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange("");
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", width: "100%" }}>
        <Search
          style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "16px",
            height: "16px",
            color: "rgba(255,255,255,0.3)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search your memories..."
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: isFocused
              ? "1px solid rgba(255,255,255,0.25)"
              : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "12px 44px 12px 44px",
            color: "rgba(255,255,255,0.85)",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.15s",
            boxSizing: "border-box",
          }}
        />
        {inputValue && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              padding: "2px",
            }}
          >
            <X style={{ width: "14px", height: "14px" }} />
          </button>
        )}
      </div>
      {query && (
        <p
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.35)",
            marginTop: "6px",
            marginLeft: "4px",
          }}
        >
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
