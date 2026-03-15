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
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<Home />} />
      <Route path="/help" element={<HelpPage />} />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
