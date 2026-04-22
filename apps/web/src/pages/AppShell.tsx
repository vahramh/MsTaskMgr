import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ProfilePage from "./ProfilePage";
import TasksPage from "../features/tasks/TasksPage";
import SharedTasksPage from "../features/shared/SharedTasksPage";
import HelpPage from "../features/help/HelpPage";
import TodayPage from "../features/today/TodayPage";
import ReviewPage from "../features/review/ReviewPage";
import ExecutionContextsPage from "../features/contexts/ExecutionContextsPage";

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? "shell-tab shell-tab-active" : "shell-tab"
      }
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
        <header className="shell-header sticky-bar">
          <div className="shell-brand-row">
            <div className="shell-brand">
              <img
                src="/branding/egs-logo-mark.svg"
                alt="Execution Guidance System"
                className="shell-brand-mark"
              />
              <div className="shell-brand-copy">
                <div className="shell-brand-eyebrow">Execution Guidance System</div>
                <div className="shell-brand-title">Execution cockpit</div>
              </div>
            </div>

            <div className="shell-header-actions">
              <button className="btn btn-secondary" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>

          <nav className="shell-nav" aria-label="Primary">
            <TabLink to="/app/today" label="Today" />
            <TabLink to="/app/review" label="Review" />
            <TabLink to="/app/tasks" label="Tasks" />
            <TabLink to="/app/shared" label="Shared" />
            <TabLink to="/app/contexts" label="Contexts" />
            <TabLink to="/app/profile" label="Profile" />
            <TabLink to="/app/help" label="Help" />
          </nav>
        </header>

        <main className="shell-main">
          <Routes>
            <Route path="today" element={<TodayPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route index element={<Navigate to="/app/today" replace />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="shared" element={<SharedTasksPage />} />
            <Route path="contexts" element={<ExecutionContextsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/app/today" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
