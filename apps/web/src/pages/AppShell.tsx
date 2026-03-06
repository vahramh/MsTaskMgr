import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ProfilePage from "./ProfilePage";
import TasksPage from "../features/tasks/TasksPage";
import SharedTasksPage from "../features/shared/SharedTasksPage";
import HelpPage from "../features/help/HelpPage";

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: isActive ? "#111827" : "white",
        color: isActive ? "white" : "#111827",
      })}
    >
      {label}
    </NavLink>
  );
}

export default function AppShell() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <div className="container">
        <div className="row space-between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Task Manager</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Phase 1 MVP</div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => window.location.assign("/")}>
              Home
            </button>

            {/* NEW: Help (public route) */}
            <button className="btn btn-secondary" onClick={() => window.location.assign("/help")}>
              Help
            </button>

            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginBottom: 14 }}>
          <TabLink to="/app/tasks" label="Tasks" />
          <TabLink to="/app/shared" label="Shared" />
          <TabLink to="/app/profile" label="Profile" />
          {/* OPTIONAL: in-app help tab */}
          <TabLink to="/app/help" label="Help" />
        </div>

        <Routes>
          <Route path="/" element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="shared" element={<SharedTasksPage />} />
          <Route path="profile" element={<ProfilePage />} />

          {/* OPTIONAL: in-app help route */}
          <Route path="help" element={<HelpPage />} />

          <Route path="*" element={<Navigate to="tasks" replace />} />
        </Routes>
      </div>
    </div>
  );
}