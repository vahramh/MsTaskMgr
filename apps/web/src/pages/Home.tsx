import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { startLogin } from "../auth/cognitoHostedUi";
import { clearTokens, isExpired } from "../auth/tokenStore";

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens, isAuthenticated, logout, setTokens } = useAuth();
  const [status, setStatus] = useState("");
  const expired = tokens ? isExpired(tokens) : false;

  useEffect(() => {
    if (tokens && expired) {
      clearTokens();
      setTokens(null);
      setStatus("Your session expired. Please sign in again.");
      return;
    }

    if (isAuthenticated && tokens && !expired) {
      const target = (location.state as { from?: string } | null)?.from ?? "/app/today";
      navigate(target, { replace: true });
    }
  }, [expired, isAuthenticated, location.state, navigate, setTokens, tokens]);

  async function onLogin() {
    setStatus("Redirecting to secure sign-in...");
    await startLogin();
  }

  return (
    <div className="marketing-page">
      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <div className="marketing-eyebrow">Execution Guidance System</div>
          <h1>Know what deserves your attention next.</h1>
          <p className="marketing-lead">
            EGS is a professional execution system for people who carry many commitments,
            projects, decisions, and follow-ups. It does not merely store tasks. It helps
            you decide what to do now, what to defer, and where execution risk is building.
          </p>

          <div className="marketing-actions">
            {!isAuthenticated ? (
              <button className="btn btn-primary" onClick={onLogin}>
                Sign in
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => navigate("/app/today")}>
                  Open Today
                </button>
                <button className="btn btn-secondary" onClick={logout}>
                  Sign out
                </button>
              </>
            )}
            <Link className="btn btn-secondary" to="/help">
              Explore the guide
            </Link>
          </div>

          <div className="marketing-note">
            Sign-up and billing flows can be added later. For now, this landing page explains
            the product clearly and gives existing users a professional entry point.
          </div>

          {status ? <div className="marketing-status">{status}</div> : null}
        </div>

        <div className="marketing-showcase card">
          <div className="marketing-showcase-header">
            <div>
              <div className="marketing-showcase-kicker">Today briefing</div>
              <div className="marketing-showcase-title">Execution, not overload</div>
            </div>
            <span className="marketing-pill marketing-pill-primary">Calm signal</span>
          </div>

          <div className="marketing-recommendation">
            <div className="marketing-recommendation-label">Best next action</div>
            <div className="marketing-recommendation-title">Send architecture summary to client</div>
            <div className="marketing-recommendation-text">
              High leverage, ready to execute, and unblocks two dependent items.
            </div>
          </div>

          <div className="marketing-metrics">
            <div className="marketing-metric">
              <div className="marketing-metric-label">Project health</div>
              <div className="marketing-metric-value">2 need attention</div>
            </div>
            <div className="marketing-metric">
              <div className="marketing-metric-label">Waiting follow-up</div>
              <div className="marketing-metric-value">3 nudges due</div>
            </div>
            <div className="marketing-metric">
              <div className="marketing-metric-label">Quick wins</div>
              <div className="marketing-metric-value">4 under 15 min</div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-header">
          <div className="marketing-eyebrow">Why EGS is different</div>
          <h2>More like a decision instrument than a to-do list.</h2>
          <p>
            Most task tools help you collect work. EGS helps you interpret it. The system is
            designed for knowledge workers, founders, consultants, and technical professionals
            who need trusted guidance across competing priorities.
          </p>
        </div>

        <div className="marketing-grid marketing-grid-3">
          <article className="card marketing-feature-card">
            <h3>Execution guidance</h3>
            <p>
              Surface the most credible next move instead of forcing the user to manually sort
              through every open item each time they sit down to work.
            </p>
          </article>
          <article className="card marketing-feature-card">
            <h3>Project health signals</h3>
            <p>
              Detect drift, blocked outcomes, stale commitments, and missing next actions before
              they quietly become risk.
            </p>
          </article>
          <article className="card marketing-feature-card">
            <h3>Review discipline</h3>
            <p>
              Keep the system trustworthy through regular processing, follow-up, and maintenance,
              so the user can rely on it under pressure.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-header">
          <div className="marketing-eyebrow">Core workflow</div>
          <h2>A practical operating rhythm.</h2>
          <p>
            Capture quickly, clarify intentionally, organise without noise, execute with focus,
            and review often enough that the system remains trusted.
          </p>
        </div>

        <div className="marketing-flow">
          <div className="card marketing-flow-step">
            <div className="marketing-step-number">01</div>
            <h3>Capture</h3>
            <p>Get commitments out of your head and into a trusted system.</p>
          </div>
          <div className="card marketing-flow-step">
            <div className="marketing-step-number">02</div>
            <h3>Clarify</h3>
            <p>Decide what each item means and what state it belongs in.</p>
          </div>
          <div className="card marketing-flow-step">
            <div className="marketing-step-number">03</div>
            <h3>Organise</h3>
            <p>Keep execution buckets, project structure, and dates logically clean.</p>
          </div>
          <div className="card marketing-flow-step">
            <div className="marketing-step-number">04</div>
            <h3>Execute</h3>
            <p>Use Today to focus on the best next action and highest-value moves.</p>
          </div>
          <div className="card marketing-flow-step">
            <div className="marketing-step-number">05</div>
            <h3>Review</h3>
            <p>Restore trust, repair drift, and keep active projects advancing.</p>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-section-tight">
        <div className="card marketing-cta-card">
          <div>
            <div className="marketing-eyebrow">Designed for professional use</div>
            <h2>Clear enough for daily execution. Strong enough for real complexity.</h2>
            <p>
              EGS is built for people who manage many moving parts and need calm structure,
              not productivity theatre.
            </p>
          </div>
          <div className="marketing-actions">
            {!isAuthenticated ? (
              <button className="btn btn-primary" onClick={onLogin}>
                Sign in
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/app/today")}>
                Open the app
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
