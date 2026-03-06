import React, { useMemo, useState } from "react";

type HelpTab = "gtd" | "app";

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "btn" : "btn btn-secondary"}
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: active ? "#111827" : "white",
        color: active ? "white" : "#111827",
        fontWeight: 700,
      }}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h2 style={{ margin: "10px 0 8px 0" }}>{title}</h2>
      {children}
    </section>
  );
}

function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        background: "white",
        borderRadius: 12,
        padding: 12,
        marginTop: 10,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <div style={{ color: "#111827" }}>{children}</div>
    </div>
  );
}

export default function HelpPage() {
  const [tab, setTab] = useState<HelpTab>("gtd");

  const lastUpdated = useMemo(() => {
    // Rendered client-side; good enough for a help page.
    return new Date().toLocaleDateString("en-AU");
  }, []);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Help</h1>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            GTD reference + user guide for this Task Manager.
          </div>
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>Last updated: {lastUpdated}</div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14, marginBottom: 6 }}>
        <TabButton active={tab === "gtd"} label="GTD Guide" onClick={() => setTab("gtd")} />
        <TabButton active={tab === "app"} label="Using Task Manager" onClick={() => setTab("app")} />
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 10, paddingTop: 14 }}>
        {tab === "gtd" ? <GtdTab /> : <AppTab />}
      </div>
    </div>
  );
}

function GtdTab() {
  return (
    <div>
      <Section title="What is GTD?">
        <p style={{ marginTop: 0 }}>
          GTD (Getting Things Done) is a workflow for managing commitments so your brain can
          focus on execution rather than remembering. The core idea is to capture everything
          that has your attention, clarify what it means, organise it into a trusted system,
          review it regularly, and then engage with clear next actions.
        </p>

        <Callout title="The GTD promise">
          <div>
            If your system is complete and current, you stop using your head as a hard drive.
            You can confidently choose what to do next.
          </div>
        </Callout>
      </Section>

      <Section title="The 5 steps of GTD">
        <ol>
          <li>
            <strong>Capture</strong> — collect everything into a trusted inbox (not scattered notes).
          </li>
          <li>
            <strong>Clarify</strong> — decide what each item is and what it means (actionable or not).
          </li>
          <li>
            <strong>Organise</strong> — put it in the right list/category (Next, Waiting, Someday, Projects, Reference).
          </li>
          <li>
            <strong>Reflect</strong> — keep the system current with regular reviews (especially Weekly Review).
          </li>
          <li>
            <strong>Engage</strong> — do the work using context, time/energy available, and priority.
          </li>
        </ol>
      </Section>

      <Section title="Actionable vs non-actionable">
        <p style={{ marginTop: 0 }}>
          When you clarify an item, your first question is: <strong>Is it actionable?</strong>
        </p>

        <Callout title="If it is not actionable">
          <ul style={{ marginTop: 6 }}>
            <li>
              <strong>Trash</strong>: delete it.
            </li>
            <li>
              <strong>Reference</strong>: keep it for information.
            </li>
            <li>
              <strong>Someday/Maybe</strong>: keep the idea, but no commitment yet.
            </li>
          </ul>
        </Callout>

        <Callout title="If it is actionable">
          <ul style={{ marginTop: 6 }}>
            <li>
              <strong>Single action</strong>: do it now if &lt;2 minutes, otherwise park it as a <strong>Next Action</strong>.
            </li>
            <li>
              <strong>Multi-step outcome</strong>: it is a <strong>Project</strong> and needs at least one Next Action.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="Projects and next actions (the engine of GTD)">
        <p style={{ marginTop: 0 }}>
          A project is any desired outcome that requires more than one action. The common GTD failure mode is having
          projects with no next actions — they become “frozen”. Your system stays alive when every active project has at
          least one visible next action.
        </p>

        <Callout title="Good next action phrasing">
          <ul style={{ marginTop: 6 }}>
            <li>
              Use <strong>verb + object</strong>: “Email Alex about quote”, “Draft agenda for meeting”, “Book venue”.
            </li>
            <li>
              Keep it granular: one clear step that can be done in one sitting.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="Contexts, time, energy, and priority">
        <p style={{ marginTop: 0 }}>
          GTD suggests choosing work based on:
        </p>
        <ul>
          <li><strong>Context</strong> (where/with what tools you can do it: Calls, Computer, Home, Errands)</li>
          <li><strong>Time available</strong> (5 minutes vs 90 minutes)</li>
          <li><strong>Energy available</strong> (high-focus vs low-energy tasks)</li>
          <li><strong>Priority</strong> (what matters most right now)</li>
        </ul>
        <p>
          This app supports context and priority so your Next list becomes executable rather than overwhelming.
        </p>
      </Section>

      <Section title="Waiting For list">
        <p style={{ marginTop: 0 }}>
          “Waiting For” is for actions blocked by an external dependency. A strong Waiting list reduces cognitive load
          because you stop mentally tracking who owes you what.
        </p>
        <Callout title="What to record when waiting">
          <ul style={{ marginTop: 6 }}>
            <li><strong>Who/what</strong> you’re waiting for</li>
            <li><strong>When you started waiting</strong> (optional)</li>
            <li><strong>Next follow-up date</strong> if relevant</li>
          </ul>
        </Callout>
      </Section>

      <Section title="Weekly Review (the maintenance cycle)">
        <p style={{ marginTop: 0 }}>
          The weekly review is the keystone habit: it keeps the system current and restores trust.
        </p>

        <ol>
          <li><strong>Get clear</strong>: empty Inbox, capture loose ends.</li>
          <li><strong>Get current</strong>: review Next, Waiting, Calendar/due items.</li>
          <li><strong>Get creative</strong>: review Projects and Someday, promote ideas.</li>
        </ol>

        <Callout title="A practical weekly checklist">
          <ul style={{ marginTop: 6 }}>
            <li>Inbox to zero (or very close).</li>
            <li>Every active project has at least one Next action.</li>
            <li>Waiting list is reviewed and chased/renegotiated.</li>
            <li>Someday is skimmed and pruned/promoted.</li>
          </ul>
        </Callout>
      </Section>

      <Section title="Common pitfalls">
        <ul>
          <li>
            <strong>Using Inbox as a list</strong> — Inbox is for capture, not storage.
          </li>
          <li>
            <strong>Projects without next actions</strong> — causes stagnation and anxiety.
          </li>
          <li>
            <strong>Over-granularity</strong> — don’t explode tasks into 50 micro-steps unless needed.
          </li>
          <li>
            <strong>No review habit</strong> — the system decays and you stop trusting it.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function AppTab() {
  return (
    <div>
      <Section title="Mental model of this system">
        <p style={{ marginTop: 0 }}>
          This app is a GTD-first Task Manager. The intent is to keep you disciplined:
          capture fast, clarify items into the right GTD state, and drive work via clear Next
          actions and project subtask trees.
        </p>

        <Callout title="Key objects">
          <ul style={{ marginTop: 6 }}>
            <li>
              <strong>Task</strong>: the basic unit.
            </li>
            <li>
              <strong>Project</strong>: a task representing an outcome (usually has subtasks).
            </li>
            <li>
              <strong>Subtasks</strong>: children of a project/task (hierarchical).
            </li>
            <li>
              <strong>Workflow State</strong>: Inbox / Next / Waiting / Someday / Reference / Completed.
            </li>
            <li>
              <strong>Context</strong>: a label to filter actionable work (Calls, Computer, Home, etc.).
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="Capture: create tasks into Inbox">
        <ul>
          <li>Create new tasks quickly with minimal detail.</li>
          <li>Use short titles; flesh out description later during clarify.</li>
        </ul>
        <Callout title="Capture rule">
          Capture first. Clarify later. Don’t do “mini planning” while capturing.
        </Callout>
      </Section>

      <Section title="Clarify: process Inbox items">
        <p style={{ marginTop: 0 }}>
          When you open an Inbox task, decide what it is and move it to the right state:
        </p>
        <ul>
          <li><strong>Next</strong>: you can do it; optionally add a context and priority.</li>
          <li><strong>Waiting</strong>: blocked; record who/what you’re waiting for.</li>
          <li><strong>Someday</strong>: not now.</li>
          <li><strong>Reference</strong>: info only.</li>
          <li><strong>Completed</strong>: done.</li>
          <li><strong>Project</strong>: if it needs multiple actions, convert/mark as project and add subtasks.</li>
        </ul>
      </Section>

      <Section title="Projects and subtasks">
        <ul>
          <li>
            Use Projects for outcomes that require multiple steps.
          </li>
          <li>
            Add child tasks as concrete next actions.
          </li>
          <li>
            “Show subtasks” loads children; “Refresh” reloads visible data.
          </li>
        </ul>

        <Callout title="Healthy project hygiene">
          Ensure every active project has at least one Next action subtask.
        </Callout>
      </Section>

      <Section title="Focus mode (project execution)">
        <p style={{ marginTop: 0 }}>
          Focus mode is for working inside a single project context. It reduces noise and makes it
          easier to sequence subtasks. Typical usage:
        </p>
        <ol>
          <li>Go to Projects</li>
          <li>Pick a project</li>
          <li>Click <strong>Focus</strong></li>
          <li>Work the next actions; capture new subtasks as they appear</li>
        </ol>
      </Section>

      <Section title="Shared tasks (collaboration)">
        <p style={{ marginTop: 0 }}>
          Sharing is based on Cognito <strong>sub</strong> identifiers. When a task is shared, the
          grantee can see it under <strong>Shared</strong>.
        </p>
        <ul>
          <li>Use Profile to find your own sub when needed.</li>
          <li>Shared tasks still follow GTD — clarify, organise, and keep Next actions explicit.</li>
        </ul>
      </Section>

      <Section title="Suggested daily routine">
        <ol>
          <li><strong>Morning</strong>: quick Inbox pass → clarify obvious items into Next/Waiting/Someday.</li>
          <li><strong>During the day</strong>: capture anything new immediately.</li>
          <li><strong>Afternoon</strong>: work the Next list; use Focus mode for 1–2 priority projects.</li>
          <li><strong>End of day</strong>: 5-minute sweep — empty Inbox if possible, check Waiting.</li>
        </ol>
      </Section>

      <Section title="Troubleshooting">
        <h3 style={{ marginBottom: 6 }}>CORS / API errors in browser</h3>
        <ul style={{ marginTop: 6 }}>
          <li>Confirm prod UI points to prod API (`qr23jztg53...`), not dev.</li>
          <li>Confirm API CORS allows origin `https://tm.melsoft.com.au`.</li>
          <li>If the UI shows a Request ID, use it to locate the server log entry.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Task not updating / conflicts</h3>
        <ul style={{ marginTop: 6 }}>
          <li>Use Refresh to reconcile state (409 protection may block stale updates).</li>
          <li>If working collaboratively, conflicts can occur; reload and retry.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Performance / too many requests</h3>
        <ul style={{ marginTop: 6 }}>
          <li>If you see request storms, stop the tab and report the exact view/action that triggers it.</li>
          <li>Most storms are caused by UI effect dependency loops; fix is client-side.</li>
        </ul>
      </Section>
    </div>
  );
}