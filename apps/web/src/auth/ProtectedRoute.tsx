import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isExpired } from "./tokenStore";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { tokens, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !tokens || isExpired(tokens)) {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
