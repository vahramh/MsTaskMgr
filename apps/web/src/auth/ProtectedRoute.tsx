import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isExpired } from "./tokenStore";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { tokens, isAuthenticated } = useAuth();

  // Not logged in
  if (!isAuthenticated || !tokens) {
    return <Navigate to="/" replace />;
  }

  // Logged in but token expired (no refresh-token logic yet)
  if (isExpired(tokens)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}