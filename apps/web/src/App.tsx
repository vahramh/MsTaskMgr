import { Routes, Route, Navigate } from "react-router-dom";

import AuthCallback from "./auth/AuthCallback";
import Home from "./pages/Home";
import AppShell from "./pages/AppShell";
import ProtectedRoute from "./auth/ProtectedRoute";
import HelpPage from "./features/help/HelpPage";

export default function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Public landing */}
      <Route path="/" element={<Home />} />
      <Route path="/help" element={<HelpPage />} />

      {/* Protected app area */}
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}