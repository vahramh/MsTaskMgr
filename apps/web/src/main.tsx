// src/main.tsx
import process from "process";
(globalThis as any).process = process;

import { Buffer } from "buffer";

// Vite/browser shims (keep these if any dependency still expects Node globals)
(globalThis as any).global = globalThis;
(globalThis as any).Buffer = Buffer;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import "./App.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);