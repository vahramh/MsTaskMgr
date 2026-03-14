import React, { useMemo, useState } from "react";

type HelpTab = "gtd" | "app";

type TocItem = {
  id: string;
  label: string;
};

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

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: 18, scrollMarginTop: 90 }}>
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

function ContentsNav({
  items,
  mobileOpen,
  setMobileOpen,
}: {
  items: TocItem[];
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <>
      <div className="help-mobile-contents-toggle">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setMobileOpen((v) => !v)}
          style={{
            width: "100%",
            justifyContent: "space-between",
            display: "flex",
          }}
        >
          <span>Contents</span>
          <span>{mobileOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      <nav
        aria-label="Help contents"
        className={`help-toc ${mobileOpen ? "help-toc-open" : ""}`}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "white",
          padding: 12,
          position: "sticky",
          top: 76,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>Contents</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => setMobileOpen(false)}
              style={{
                color: "#111827",
                textDecoration: "none",
                fontSize: 14,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid transparent",
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <style>
        {`
          .help-layout {
            display: grid;
            grid-template-columns: 260px minmax(0, 1fr);
            gap: 24px;
            align-items: start;
          }

          .help-mobile-contents-toggle {
            display: none;
            margin-bottom: 12px;
          }

          @media (max-width: 860px) {
            .help-layout {
              grid-template-columns: 1fr;
              gap: 12px;
            }

            .help-mobile-contents-toggle {
              display: block;
            }

            .help-toc {
              position: static !important;
              display: none;
            }

            .help-toc.help-toc-open {
              display: block;
            }
          }
        `}
      </style>
    </>
  );
}

export default function HelpPage() {
  const [tab, setTab] = useState<HelpTab>("gtd");
  const [mobileOpen, setMobileOpen] = useState(false);

  const lastUpdated = useMemo(() => {
    return new Date().toLocaleDateString("en-AU");
  }, []);

  const gtdToc: TocItem[] = [
    { id: "gtd-what-is-egs", label: "What is EGS?" },
    { id: "gtd-5-steps", label: "The 5 steps of EGS" },
    { id: "gtd-actionable", label: "Actionable vs non-actionable" },
    { id: "gtd-projects-next", label: "Projects and next actions" },
    { id: "gtd-context-time-energy", label: "Contexts, time, energy, priority" },
    { id: "gtd-scheduled-vs-next", label: "Scheduled vs Next" },
    { id: "gtd-waiting-for", label: "Waiting For list" },
    { id: "gtd-weekly-review", label: "Weekly Review" },
    { id: "gtd-common-pitfalls", label: "Common pitfalls" },
  ];

  const appToc: TocItem[] = [
    { id: "app-mental-model", label: "Mental model" },
    { id: "app-how-egs-works", label: "How EGS works" },
    { id: "app-capture", label: "Capture" },
    { id: "app-clarify", label: "Clarify" },
    { id: "app-tasks-page", label: "Tasks page" },
    { id: "app-editing-tasks", label: "Editing tasks" },
    { id: "app-voice-capture", label: "Voice capture" },
    { id: "app-execution-buckets", label: "Execution buckets" },
    { id: "app-projects-subtasks", label: "Projects and subtasks" },
    { id: "app-today-dashboard", label: "Today dashboard" },
    { id: "app-review-dashboard", label: "Review dashboard" },
    { id: "app-guided-actions", label: "Guided Actions" },
    { id: "app-quick-actions", label: "Quick actions" },
    { id: "app-focus-mode", label: "Focus mode" },
    { id: "app-shared-tasks", label: "Shared tasks" },
    { id: "app-daily-routine", label: "Suggested daily routine" },
    { id: "app-weekly-routine", label: "Suggested weekly routine" },
    { id: "app-troubleshooting", label: "Troubleshooting" },
  ];

  const toc = tab === "gtd" ? gtdToc : appToc;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>Help</h1>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            Execution Guidance System (EGS) concepts and Task Manager usage guide.
          </div>
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>Last updated: {lastUpdated}</div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14, marginBottom: 10, flexWrap: "wrap" }}>
        <TabButton
          active={tab === "gtd"}
          label="EGS Guide"
          onClick={() => {
            setTab("gtd");
            setMobileOpen(false);
          }}
        />
        <TabButton
          active={tab === "app"}
          label="Using Task Manager"
          onClick={() => {
            setTab("app");
            setMobileOpen(false);
          }}
        />
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 10, paddingTop: 14 }}>
        <div className="help-layout">
          <div>
            <ContentsNav items={toc} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
          </div>

          <div>{tab === "gtd" ? <GtdTab /> : <AppTab />}</div>
        </div>
      </div>
    </div>
  );
}

function GtdTab() {
  return (
    <div>
      <Section id="gtd-what-is-egs" title="What is the Execution Guidance System (EGS)?">
        <p style={{ marginTop: 0 }}>
          The Execution Guidance System (EGS) is a structured workflow for managing commitments
          so your attention can stay focused on execution rather than remembering. The system
          combines disciplined capture and clarification with operational guidance that helps
          you decide what deserves attention next.
        </p>
        <p>
          Instead of simply storing tasks, EGS continuously evaluates your work using Today,
          Review and Guided Actions to highlight what needs attention, what is blocked,
          and what requires follow-up.
        </p>
        <Callout title="The EGS promise">
          <div>
            If your system is complete and current, you stop using your head as a hard drive.
            You can confidently choose what to do next.
          </div>
        </Callout>
      </Section>

      <Section id="gtd-5-steps" title="The 5 steps of EGS">
        The Execution Guidance System follows a structured cycle that keeps commitments clear, organised and actionable.
        <ol>
          <li>
            <strong>Capture</strong> — collect everything into a trusted inbox, not scattered notes.
          </li>
          <li>
            <strong>Clarify</strong> — decide what each item is and what it means, actionable or not.
          </li>
          <li>
            <strong>Organise</strong> — put it in the right list or category: Next, Scheduled, Waiting, Someday, Reference, Projects.
          </li>
          <li>
            <strong>Reflect</strong> — keep the system current with regular reviews, especially the Weekly Review.
          </li>
          <li>
            <strong>Engage</strong> — do the work using context, time and energy available, and priority.
          </li>
        </ol>
      </Section>

      <Section id="gtd-actionable" title="Actionable vs non-actionable">
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
              <strong>Single action</strong>: do it now if it is trivial, otherwise park it as a <strong>Next Action</strong> or <strong>Scheduled</strong> item.
            </li>
            <li>
              <strong>Multi-step outcome</strong>: it is a <strong>Project</strong> and needs at least one Next Action.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section id="gtd-projects-next" title="Projects and next actions (the engine of EGS)">
        <p style={{ marginTop: 0 }}>
          A project is any desired outcome that requires more than one action. The common EGS failure mode is having
          projects with no next actions — they become frozen. Your system stays alive when every active project has at
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

      <Section id="gtd-context-time-energy" title="Contexts, time, energy, and priority">
        <p style={{ marginTop: 0 }}>
          EGS suggests choosing work based on:
        </p>
        <ul>
          <li><strong>Context</strong> — where or with what tools you can do it, such as Calls, Computer, Home, Errands</li>
          <li><strong>Time available</strong> — 5 minutes vs 90 minutes</li>
          <li><strong>Energy available</strong> — high-focus vs low-energy tasks</li>
          <li><strong>Priority</strong> — what matters most right now</li>
        </ul>
        <p>
          This app supports context, effort and priority so your actionable work becomes executable rather than overwhelming.
        </p>
      </Section>

      <Section id="gtd-scheduled-vs-next" title="Scheduled vs Next">
        <p style={{ marginTop: 0 }}>
          Not all actionable work belongs on the same list.
        </p>

        <Callout title="Use Next when">
          <ul style={{ marginTop: 6 }}>
            <li>The action is available to be done as soon as you choose to do it.</li>
            <li>You want it visible in your actionable inventory.</li>
            <li>You are choosing between options based on context, effort, priority or energy.</li>
          </ul>
        </Callout>

        <Callout title="Use Scheduled when">
          <ul style={{ marginTop: 6 }}>
            <li>The task has a real date commitment or deadline.</li>
            <li>You want it reviewed as calendar-bound work rather than general available work.</li>
            <li>You need the system to treat date slippage seriously.</li>
          </ul>
        </Callout>
      </Section>

      <Section id="gtd-waiting-for" title="Waiting For list">
        <p style={{ marginTop: 0 }}>
          “Waiting For” is for actions blocked by an external dependency. A strong Waiting list reduces cognitive load
          because you stop mentally tracking who owes you what.
        </p>
        <Callout title="What to record when waiting">
          <ul style={{ marginTop: 6 }}>
            <li><strong>Who or what</strong> you’re waiting for</li>
            <li><strong>When you started waiting</strong>, if useful</li>
            <li><strong>Next follow-up date</strong> if relevant</li>
          </ul>
        </Callout>
      </Section>

      <Section id="gtd-weekly-review" title="Weekly Review (the maintenance cycle)">
        <p style={{ marginTop: 0 }}>
          The weekly review is the keystone habit. It keeps the system current and restores trust.
        </p>

        <ol>
          <li><strong>Get clear</strong>: empty Inbox and capture loose ends.</li>
          <li><strong>Get current</strong>: review Next, Waiting and Scheduled items.</li>
          <li><strong>Get creative</strong>: review Projects and Someday, promote ideas.</li>
        </ol>

        <Callout title="A practical weekly checklist">
          <ul style={{ marginTop: 6 }}>
            <li>Inbox to zero, or very close.</li>
            <li>Every active project has at least one Next action.</li>
            <li>Waiting list is reviewed and chased or renegotiated.</li>
            <li>Scheduled work is reviewed for slippage and re-commitment.</li>
            <li>Someday is skimmed and pruned or promoted.</li>
          </ul>
        </Callout>
      </Section>

      <Section id="gtd-common-pitfalls" title="Common pitfalls">
        <ul>
          <li>
            <strong>Using Inbox as a list</strong> — Inbox is for capture, not storage.
          </li>
          <li>
            <strong>Projects without next actions</strong> — causes stagnation and anxiety.
          </li>
          <li>
            <strong>Too much calendar pollution</strong> — do not schedule work unless the date matters.
          </li>
          <li>
            <strong>Over-granularity</strong> — do not explode tasks into 50 micro-steps unless needed.
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
      <Section id="app-mental-model" title="Mental model of this system">
        <p style={{ marginTop: 0 }}>
          This application implements the Execution Guidance System (EGS). The intent is to keep you disciplined:
          capture fast, clarify items into the right EGS state, and drive work via clear Next
          actions and project subtask trees.
        </p>

        <Callout title="Key objects">
          <ul style={{ marginTop: 6 }}>
            <li>
              <strong>Task</strong>: the basic unit.
            </li>
            <li>
              <strong>Project</strong>: a task representing an outcome, usually with subtasks.
            </li>
            <li>
              <strong>Subtasks</strong>: children of a project or task, forming a hierarchy.
            </li>
            <li>
              <strong>Workflow State</strong>: Inbox / Next / Scheduled / Waiting / Someday / Reference / Completed.
            </li>
            <li>
              <strong>Context</strong>: a label to filter actionable work, such as Calls, Computer, Home.
            </li>
            <li>
              <strong>Effort</strong>: a lightweight estimate used by the system when ranking work.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section id="app-how-egs-works" title="How EGS works in this system">
        <p style={{ marginTop: 0 }}>
          EGS operates through three operational views in the application:
        </p>

        <ul>
          <li><strong>Tasks</strong> — where commitments are captured, clarified and organised.</li>
          <li><strong>Today</strong> — an execution dashboard that ranks work using deterministic scoring.</li>
          <li><strong>Review</strong> — a maintenance view used to keep the system healthy and trustworthy.</li>
        </ul>

        <Callout title="Guided Actions">
          The system also generates Guided Actions (Insights). These highlight problems
          such as stalled projects, missing next actions, ageing tasks, or waiting items
          that need follow-up.
        </Callout>
      </Section>

      <Section id="app-capture" title="Capture: create tasks into Inbox">
        <ul>
          <li>Create new tasks quickly with minimal detail.</li>
          <li>Use short titles and flesh out the description later during clarify.</li>
        </ul>
        <Callout title="Capture rule">
          Capture first. Clarify later. Do not do mini-planning while capturing.
        </Callout>
      </Section>

      <Section id="app-clarify" title="Clarify: process Inbox items">
        <p style={{ marginTop: 0 }}>
          When you open an Inbox task, decide what it is and move it to the right state:
        </p>
        <ul>
          <li><strong>Next</strong>: available to do now; optionally add context, priority and effort.</li>
          <li><strong>Scheduled</strong>: committed to a specific date or deadline.</li>
          <li><strong>Waiting</strong>: blocked by someone or something else.</li>
          <li><strong>Someday</strong>: not now.</li>
          <li><strong>Reference</strong>: information only.</li>
          <li><strong>Completed</strong>: done.</li>
          <li><strong>Project</strong>: if it needs multiple actions, manage it as an outcome and add subtasks.</li>
        </ul>
      </Section>

      <Section id="app-tasks-page" title="Tasks page">
        <p style={{ marginTop: 0 }}>
          The Tasks page is the main workspace where commitments are organised and clarified.
          It supports both <strong>execution buckets</strong> and <strong>project planning views</strong>.
        </p>

        <Callout title="Two ways to work on the Tasks page">
          <ul style={{ marginTop: 6 }}>
            <li>
              <strong>Execution buckets</strong> — show actionable tasks grouped by workflow state
              (Inbox, Next, Scheduled, Waiting, Someday, Reference, Completed).
            </li>
            <li>
              <strong>Project workspace</strong> — lets you focus on a single project and work through
              its hierarchy of subtasks.
            </li>
          </ul>
        </Callout>

        <ul>
          <li>Create new tasks quickly into the Inbox.</li>
          <li>Edit tasks inline without leaving the list.</li>
          <li>Expand tasks to reveal subtasks.</li>
          <li>Focus on a project to plan its next steps.</li>
        </ul>
      </Section>

      <Section id="app-editing-tasks" title="Editing tasks">
        <p style={{ marginTop: 0 }}>
          Tasks can be edited directly inside the list without opening a separate screen.
        </p>

        <ul>
          <li>Click <strong>Edit</strong> to change title, description or metadata.</li>
          <li>Use workflow state to move work between Inbox, Next, Scheduled, Waiting and other lists.</li>
          <li>Quick actions allow fast updates such as marking a task completed.</li>
        </ul>

        <Callout title="Inline editing">
          Inline editing allows fast adjustments without navigating away from the current view,
          making the system faster for daily use.
        </Callout>
      </Section>

      <Section id="app-voice-capture" title="Voice capture">
        <p style={{ marginTop: 0 }}>
          Tasks can be captured using voice input. The system attempts to extract useful information
          such as due dates or waiting indicators from the spoken text.
        </p>

        <ul>
          <li>Use the microphone button when creating a task.</li>
          <li>The spoken sentence becomes the task title.</li>
          <li>Dates and simple phrases may be interpreted automatically.</li>
        </ul>

        <Callout title="Capture principle">
          Voice capture is meant for fast collection of ideas. Clarify the details later.
        </Callout>
      </Section>

      <Section id="app-execution-buckets" title="Execution buckets">
        <p style={{ marginTop: 0 }}>
          Execution buckets group tasks by their workflow state so you can focus on the type of work
          you want to perform.
        </p>

        <ul>
          <li><strong>Inbox</strong> — captured items waiting to be clarified.</li>
          <li><strong>Next</strong> — actionable work available to do now.</li>
          <li><strong>Scheduled</strong> — tasks tied to a specific date.</li>
          <li><strong>Waiting</strong> — work blocked by an external dependency.</li>
          <li><strong>Someday</strong> — ideas not currently active.</li>
          <li><strong>Reference</strong> — information kept for later.</li>
          <li><strong>Completed</strong> — finished work.</li>
        </ul>

        <Callout title="Key rule">
          Tasks appear in these buckets based on their workflow state,
          even if they belong to a project.
        </Callout>
      </Section>

      <Section id="app-projects-subtasks" title="Projects and subtasks">
        <ul>
          <li>Projects represent outcomes that require multiple actions.</li>
          <li>Subtasks represent the concrete steps required to achieve that outcome.</li>
          <li>Subtasks can themselves contain further subtasks if the work requires deeper breakdown.</li>
        </ul>

        <Callout title="Execution rule">
          Projects themselves do <strong>not</strong> appear in execution buckets.
          Only actionable tasks appear there, even if they belong to a project.
        </Callout>

        <Callout title="Healthy project hygiene">
          Ensure every active project has at least one visible <strong>Next action</strong>.
          Projects without next actions tend to stall and are highlighted during review.
        </Callout>
      </Section>

      <Section id="app-today-dashboard" title="Today dashboard">
        <p style={{ marginTop: 0 }}>
          The Today page is an execution view. It does not just list tasks; it performs server-side aggregation to help
          you decide what to do next.
        </p>
        <ul>
          <li>Includes overdue work and work due today.</li>
          <li>Surfaces waiting follow-ups that may need chasing.</li>
          <li>Ranks recommended work using deterministic scoring.</li>
          <li>Considers effort, priority, staleness, context and project health.</li>
          <li>Traverses descendants so project structure contributes to the recommendation model.</li>
          <li>Can include shared tasks when relevant.</li>
        </ul>

        <Callout title="Use Today when">
          <div>
            You want an operational view of what deserves attention now, without manually reviewing every list.
          </div>
        </Callout>
      </Section>

      <Section id="app-review-dashboard" title="Review dashboard">
        <p style={{ marginTop: 0 }}>
          The Review page is your Weekly Review workspace. It summarises system hygiene and highlights areas that need attention.
        </p>
        <ul>
          <li>Inbox counts</li>
          <li>Projects without a Next action</li>
          <li>Waiting follow-ups</li>
          <li>Stale tasks</li>
          <li>Old Someday items</li>
          <li>Overdue Scheduled tasks</li>
          <li>Project health checks</li>
        </ul>

        <Callout title="Review principle">
          Work top to bottom until the system is trustworthy again.
        </Callout>
      </Section>

      <Section id="app-guided-actions" title="Guided Actions (Insights)">
        <p style={{ marginTop: 0 }}>
          Guided Actions are deterministic recommendations generated by the server. They are not AI chat suggestions.
          They are operational prompts that help you keep the system clean and actionable.
        </p>
        <ul>
          <li>Promote actionable Inbox items to Next</li>
          <li>Identify projects missing a Next action</li>
          <li>Highlight stale Waiting items needing follow-up</li>
          <li>Spot missing context or effort estimates</li>
          <li>Show stale tasks and ageing Someday items</li>
        </ul>

        <Callout title="Where Guided Actions appear">
          <div>
            Guided Actions are embedded into the <strong>Today</strong> and <strong>Review</strong> pages. They are meant to support decision-making where you already work, not create another separate workflow.
          </div>
        </Callout>
      </Section>

      <Section id="app-quick-actions" title="Quick actions from Guided Actions">
        <p style={{ marginTop: 0 }}>
          Where possible, Guided Actions let you fix the issue immediately without navigating away.
        </p>
        <ul>
          <li>Set a task to <strong>Next</strong></li>
          <li>Add a missing <strong>context</strong></li>
          <li>Add a missing <strong>effort estimate</strong></li>
          <li>Set a <strong>due date</strong> or follow-up date</li>
          <li>Create a <strong>Next Action</strong> directly under a project</li>
          <li>Open the task in the main Tasks workflow</li>
        </ul>
      </Section>

      <Section id="app-focus-mode" title="Focus mode and project execution">
        <p style={{ marginTop: 0 }}>
          Focus mode opens a dedicated project workspace where you can
          sequence subtasks and plan the next actions required to complete the project.
        </p>
        <ol>
          <li>Go to Projects or Tasks</li>
          <li>Pick a project</li>
          <li>Open its working context</li>
          <li>Execute or create the next concrete subtasks</li>
        </ol>
      </Section>

      <Section id="app-shared-tasks" title="Shared tasks (collaboration)">
        <p style={{ marginTop: 0 }}>
          Sharing is based on Cognito <strong>sub</strong> identifiers. When a task is shared, the grantee can see it under <strong>Shared</strong>.
        </p>
        <ul>
          <li>Use Profile to find your own sub when needed.</li>
          <li>Shared tasks can also participate in Today and Review views.</li>
          <li>Shared work still follows EGS: clarify it, keep next actions explicit, and review it regularly.</li>
        </ul>
      </Section>

      <Section id="app-daily-routine" title="Suggested daily routine">
        <ol>
          <li><strong>Morning</strong>: quick Inbox pass, clarify obvious items into Next, Scheduled, Waiting or Someday.</li>
          <li><strong>Then</strong>: check Today for recommended work.</li>
          <li><strong>During the day</strong>: capture anything new immediately.</li>
          <li><strong>Use Guided Actions</strong>: fix missing metadata and unblock stalled projects when prompted.</li>
          <li><strong>End of day</strong>: short sweep of Waiting and Scheduled work, then reduce Inbox again if possible.</li>
        </ol>
      </Section>

      <Section id="app-weekly-routine" title="Suggested weekly routine">
        <ol>
          <li>Open <strong>Review</strong>.</li>
          <li>Process Inbox items.</li>
          <li>Check Waiting For and chase stale items.</li>
          <li>Ensure every project has a Next action.</li>
          <li>Review overdue Scheduled items.</li>
          <li>Review Someday and stale tasks.</li>
          <li>Use Guided Actions to fix issues quickly.</li>
        </ol>
      </Section>

      <Section id="app-troubleshooting" title="Troubleshooting">
        <h3 style={{ marginBottom: 6 }}>CORS / API errors in browser</h3>
        <ul style={{ marginTop: 6 }}>
          <li>Confirm prod UI points to prod API, not dev.</li>
          <li>Confirm API CORS allows origin <code>https://tm.melsoft.com.au</code>.</li>
          <li>If the UI shows a Request ID, use it to locate the server log entry.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Task not updating / conflicts</h3>
        <ul style={{ marginTop: 6 }}>
          <li>Use Refresh to reconcile state; revision protection may block stale updates.</li>
          <li>If working collaboratively, conflicts can occur; reload and retry.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Today or Review does not look right</h3>
        <ul style={{ marginTop: 6 }}>
          <li>Check whether the task states are correct: Next vs Scheduled vs Waiting matters.</li>
          <li>Check for missing context, effort or due dates where appropriate.</li>
          <li>Remember that project health depends on having at least one concrete Next action.</li>
          <li>Guided Actions are generated from system analysis and may change after edits or refresh.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Guided Actions not showing much</h3>
        <ul style={{ marginTop: 6 }}>
          <li>This usually means the system is healthy, not broken.</li>
          <li>Guided Actions are issue-driven; if there are no meaningful problems, there may be few or no suggestions.</li>
        </ul>

        <h3 style={{ marginBottom: 6 }}>Performance / too many requests</h3>
        <ul style={{ marginTop: 6 }}>
          <li>If you see request storms, stop the tab and note the exact view or action that triggers it.</li>
          <li>Most storms are caused by client-side effect dependency loops.</li>
          <li>Today, Review and Guided Actions are computed server-side to reduce repeated client work.</li>
        </ul>
      </Section>
    </div>
  );
}