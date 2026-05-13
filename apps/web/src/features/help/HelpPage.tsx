import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { startLogin } from "../../auth/cognitoHostedUi";

type HelpTab = "egs" | "app";
type HelpTone = "neutral" | "accent" | "warning";

type HelpItem = {
  title: string;
  body: string[];
};

type QuickAnswer = {
  question: string;
  answer: string;
};

type WorkflowRecipe = {
  title: string;
  purpose: string;
  steps: string[];
};

type HelpChapter = {
  id: string;
  tab: HelpTab;
  label: string;
  title: string;
  summary: string;
  body?: string[];
  items?: HelpItem[];
  callout?: {
    title: string;
    body: string;
    tone?: HelpTone;
  };
};

type TocItem = {
  id: string;
  label: string;
};

function normaliseSearch(value: string) {
  return value.trim().toLowerCase();
}

function chapterSearchText(chapter: HelpChapter) {
  return [
    chapter.label,
    chapter.title,
    chapter.summary,
    ...(chapter.body ?? []),
    ...(chapter.items ?? []).flatMap((item) => [item.title, ...item.body]),
    chapter.callout?.title ?? "",
    chapter.callout?.body ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

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
      type="button"
      className={active ? "btn btn-primary" : "btn btn-secondary"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Callout({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: HelpTone;
}) {
  return (
    <div className={`help-callout help-callout-${tone}`}>
      <div className="help-callout-title">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function ContentsNav({
  items,
  mobileOpen,
  setMobileOpen,
  onJump,
}: {
  items: TocItem[];
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onJump: (id: string) => void;
}) {
  return (
    <>
      <div className="help-mobile-contents-toggle">
        <label
          htmlFor="help-chapter-jump"
          style={{ display: "block", marginBottom: 6 }}
        >
          Jump to chapter
        </label>
        <select
          id="help-chapter-jump"
          aria-label="Jump to help chapter"
          className="form-control"
          onChange={(event) => onJump(event.target.value)}
          defaultValue=""
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="" disabled>
            Choose a chapter…
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setMobileOpen((value) => !value)}
          style={{
            width: "100%",
            justifyContent: "space-between",
            display: "flex",
          }}
        >
          <span>All chapters</span>
          <span>{mobileOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      <nav
        className={`help-toc ${mobileOpen ? "help-toc-open" : ""}`}
        aria-label="Help contents"
        style={{ position: "sticky", top: 16, alignSelf: "start" }}
      >
        <div className="help-toc-title">Contents</div>
        <div className="help-toc-links">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}

function HelpSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="help-callout help-callout-accent" style={{ marginTop: 18 }}>
      <label className="help-callout-title" htmlFor="help-search">
        Search help
      </label>
      <input
        id="help-search"
        aria-label="Search help"
        placeholder="Search help by title, state, context, email, Today, priority…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          boxSizing: "border-box",
          marginTop: 8,
          padding: 10,
          width: "100%",
        }}
      />
    </div>
  );
}

function QuickAnswers({ answers }: { answers: QuickAnswer[] }) {
  return (
    <section id="quick-answers" className="help-section">
      <h2>Quick Answers</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {answers.map((item) => (
          <details key={item.question} className="help-flow-card">
            <summary className="help-flow-card-title">{item.question}</summary>
            <p className="help-flow-body">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function WorkflowRecipes({ recipes }: { recipes: WorkflowRecipe[] }) {
  return (
    <section id="workflow-recipes" className="help-section">
      <h2>Workflow recipes</h2>
      <p>
        These recipes translate the knowledge base into repeatable operating
        patterns. Use them when the system feels noisy or when you want to
        recover trust quickly.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {recipes.map((recipe) => (
          <details key={recipe.title} className="help-flow-card">
            <summary className="help-flow-card-title">{recipe.title}</summary>
            <p className="help-flow-body">{recipe.purpose}</p>
            <ol>
              {recipe.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}

function ChapterSection({
  chapter,
  defaultOpen,
}: {
  chapter: HelpChapter;
  defaultOpen: boolean;
}) {
  return (
    <section id={chapter.id} className="help-section">
      <details open={defaultOpen}>
        <summary>
          <h2 style={{ display: "inline" }}>{chapter.title}</h2>
        </summary>
        <p>{chapter.summary}</p>
        {chapter.body?.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {chapter.items?.map((item) => (
          <details
            key={item.title}
            className="help-flow-card"
            style={{ marginTop: 10 }}
          >
            <summary className="help-flow-card-title">{item.title}</summary>
            {item.body.map((paragraph) => (
              <p key={paragraph} className="help-flow-body">
                {paragraph}
              </p>
            ))}
          </details>
        ))}
        {chapter.callout ? (
          <Callout
            title={chapter.callout.title}
            tone={chapter.callout.tone ?? "neutral"}
          >
            {chapter.callout.body}
          </Callout>
        ) : null}
      </details>
    </section>
  );
}

const quickAnswers: QuickAnswer[] = [
  {
    question: "What should I do next?",
    answer:
      "Open Today. Start with Best Next Action when it is available. If Today shows a Best Next Move instead, repair the system first: process Inbox, follow up Waiting, clarify a project, or prepare weak Next actions.",
  },
  {
    question: "Why is a task recommended?",
    answer:
      "A task is recommended because it appears executable and useful now. EGS weighs readiness, state, due pressure, project leverage, priority, context, effort, remaining time, minimum duration, and friction such as blocked structure or unresolved children.",
  },
  {
    question: "Why is my task not appearing in Today?",
    answer:
      "It may be in Inbox, Waiting, Someday, Reference, Completed, or it may be a project rather than an action. It may also be scheduled for a future date, blocked by a parent, too vague, or represented by child actions that are more executable.",
  },
  {
    question: "What does Scheduled mean?",
    answer:
      "Scheduled means you intend to work on the action on a specific day. It is not the same as a fixed calendar appointment. Use it conservatively; aspirational dates create artificial urgency and reduce trust.",
  },
  {
    question: "How do contexts affect recommendations?",
    answer:
      "Contexts describe the circumstances where work is realistic: place, person, tool, mode, or energy. They help Today and recommendation emails group work by the situation in which it can actually be done.",
  },
  {
    question: "What do weekday/weekend context minutes do?",
    answer:
      "They describe normal execution capacity for a context on weekdays and weekends. Recommendation emails use these values to suggest realistic allocations, applying the 80% planning rule so the day is not overfilled.",
  },
  {
    question: "Why did I not receive a recommendation email?",
    answer:
      "Check Settings for the email schedule and recommendation count, then check the Contexts tab for significant contexts. Emails are generated around significant contexts and available recommendations; zero-minute context budgets or no significant contexts can make the email unhelpful or empty.",
  },
];

const workflowRecipes: WorkflowRecipe[] = [
  {
    title: "Process Inbox",
    purpose: "Turn captured fragments into meaningful system records.",
    steps: [
      "Open Inbox and decide what each item actually is.",
      "Delete it, move it to Reference, mark it Someday, create a project, or convert it into an action.",
      "If it belongs to an existing project, file the Inbox item into that project as a child action.",
      "Only mark it Next when it is genuinely startable.",
    ],
  },
  {
    title: "Plan today",
    purpose:
      "Use Today as the execution briefing rather than manually re-triaging everything.",
    steps: [
      "Read Best Next Action first.",
      "Scan Recommended Tasks for alternatives that better fit current context or energy.",
      "Check Guided Actions and Needs Attention if the primary recommendation is maintenance-oriented.",
      "Use Project Health to spot outcomes that need repair before more execution.",
    ],
  },
  {
    title: "Set up contexts",
    purpose:
      "Make recommendations reflect where and how work can actually happen.",
    steps: [
      "Create practical contexts such as Office, Home, Calls, Errands, Deep Focus, or Client Office.",
      "Set the context type: place, person, tool, mode, or energy.",
      "Mark only important contexts as significant for recommendation emails.",
      "Enter realistic weekday and weekend minutes for each significant context.",
    ],
  },
  {
    title: "Use recommendation emails",
    purpose:
      "Convert guidance into a daily execution plan without opening the app first.",
    steps: [
      "Set the recommendation email schedule in Settings.",
      "Use Send recommendation email now to test the current configuration.",
      "Review Best Next Action, context sections, and suggested execution allocations.",
      "Treat allocations as guidance, not calendar bookings.",
    ],
  },
  {
    title: "Manage Waiting tasks",
    purpose: "Keep blocked work visible and recoverable.",
    steps: [
      "Use Waiting when an action depends on a person, event, or another task.",
      "For work inside a project, use the same-project waiting link when one task depends on another child action.",
      "Follow up stale waiting items from Today, Guided Actions, Needs Attention, or Review.",
      "When the blocking task completes, move the waiting action back to Inbox or Next as appropriate.",
    ],
  },
  {
    title: "Review the system weekly",
    purpose:
      "Restore trust before the guidance model starts reflecting stale data.",
    steps: [
      "Process Inbox close to zero.",
      "Repair projects with no visible next action, scheduled commitment, or real waiting dependency.",
      "Check overdue, stale, and unrealistic Scheduled items.",
      "Move optional work to Someday and archive obsolete contexts or reference-only material.",
    ],
  },
];

const helpChapters: HelpChapter[] = [
  {
    id: "egs-purpose",
    tab: "egs",
    label: "Purpose",
    title: "EGS purpose: guidance over storage",
    summary:
      "EGS is an execution guidance system. It is designed to reduce decision friction and answer what deserves attention next, not merely store tasks.",
    body: [
      "A normal task manager captures commitments and leaves the user to re-prioritise them repeatedly. EGS adds interpretation: state, project structure, due pressure, context, effort, remaining time, minimum duration, waiting signals, and review health all contribute to guidance.",
      "The system is strongest when the data is honest. Inbox means unclarified, Next means startable, Waiting means blocked, Scheduled means intended for a specific day, and projects need a visible path forward.",
    ],
    callout: {
      title: "Operating standard",
      body: "When EGS is healthy, Today should feel like a calm briefing rather than another list to triage.",
      tone: "accent",
    },
  },
  {
    id: "egs-states",
    tab: "egs",
    label: "Workflow states",
    title: "Workflow states",
    summary:
      "States are not cosmetic labels. They tell EGS how to interpret a record and whether it should affect execution, review, or reference.",
    items: [
      {
        title: "Inbox",
        body: [
          "Captured but not clarified. Inbox is temporary holding, not a working list. Process it regularly so the system is not forced to reason around ambiguity.",
        ],
      },
      {
        title: "Next",
        body: [
          "Executable now. Next actions are the strongest Today candidates when they are clearly worded, structurally unblocked, and have enough metadata to be trusted.",
        ],
      },
      {
        title: "Waiting",
        body: [
          "Blocked by another person, event, or task. Waiting work should be reviewed and followed up; it should not disappear from operational awareness.",
        ],
      },
      {
        title: "Scheduled",
        body: [
          "Intended for execution on a specific day. Scheduled is useful for date-shaped intention, but overusing it for hopes creates artificial urgency.",
        ],
      },
      {
        title: "Someday, Reference, Completed",
        body: [
          "Someday keeps optional future work out of the active system. Reference stores information rather than action. Completed retains traceability and project memory.",
        ],
      },
    ],
  },
  {
    id: "egs-today",
    tab: "egs",
    label: "Today view",
    title: "Today view",
    summary:
      "Today is the primary execution surface. It narrows the field to the most credible actions, alternatives, maintenance moves, and project risks.",
    items: [
      {
        title: "Best Next Action",
        body: [
          "The highest-confidence immediate execution recommendation. It should usually be a ready or weak-ready action, not a project, Inbox item, waiting item, reference item, or completed item.",
          "A task usually needs a good mix of readiness, definition quality, due pressure, priority, effort fit, and project leverage to win this position.",
        ],
      },
      {
        title: "Recommended tasks",
        body: [
          "Ranked alternatives for the current day or work session. Use them when Best Next Action is not right for your current context, energy, or available block of time.",
        ],
      },
      {
        title: "Guided Actions",
        body: [
          "Maintenance recommendations such as Process Inbox, Follow Up Waiting, Clarify Projects, Restore Project Momentum, Unblock Waiting Projects, Break Down Large Tasks, and Prepare Next Actions.",
        ],
      },
      {
        title: "Project Health",
        body: [
          "Diagnostic signals showing whether active outcomes have momentum, a clear path, waiting risk, deadline pressure, or structural ambiguity.",
        ],
      },
    ],
  },
  {
    id: "egs-projects-actions",
    tab: "egs",
    label: "Projects and actions",
    title: "Projects, actions, and child structure",
    summary:
      "Projects are outcomes requiring more than one step. Actions are executable units. Child actions should clarify the path, not hide it.",
    body: [
      "A project should normally have a believable path forward: a Next action, a real Scheduled action, or a genuine Waiting dependency. Without one of these, the project is open but not operational.",
      "Subtasks and child actions are useful when they make execution more precise. If a parent task has actionable children, EGS may treat the children as the real execution units and reduce confidence in the parent as a direct recommendation.",
      "Filing Inbox items into projects is important because many captured items are really steps inside an existing outcome. File them under the correct project rather than keeping them as isolated standalone actions.",
    ],
  },
  {
    id: "egs-waiting-dependencies",
    tab: "egs",
    label: "Waiting dependencies",
    title: "Waiting on another task in the same project",
    summary:
      "Waiting can be free text, but project work can also wait on another task in the same project so the dependency is explicit.",
    body: [
      "Use this when one child action cannot proceed until another child action is complete. The blocked action stays visible as Waiting, and once the dependency is completed it can resume into Inbox or Next depending on the intended flow.",
      "This keeps blocked work out of direct execution recommendations while still preserving project health and follow-up visibility.",
    ],
  },
  {
    id: "egs-priority-dates-effort",
    tab: "egs",
    label: "Priority and effort",
    title: "Priority, dates, effort, remaining time, and minimum duration",
    summary:
      "These fields help EGS estimate importance, urgency, size, and startability. They work best when used honestly rather than mechanically.",
    items: [
      {
        title: "Priority scale",
        body: [
          "Priority 1 is the highest importance: the work that most deserves attention. Higher numbers are lower priority. Priority matters, but it is one signal among readiness, due pressure, context, and project leverage.",
        ],
      },
      {
        title: "Due dates",
        body: [
          "Due dates should represent genuine commitments or real time sensitivity. Artificial dates make the system anxious and can distort Today.",
        ],
      },
      {
        title: "Effort and remaining time",
        body: [
          "Effort is the approximate overall size. Remaining time is the work still required. Remaining time is especially useful when a task can be progressed in parts rather than completed in one sitting.",
        ],
      },
      {
        title: "Minimum duration",
        body: [
          "Minimum duration is the smallest useful uninterrupted work block. It protects deep work from being recommended into tiny fragments and helps emails suggest realistic allocations.",
        ],
      },
    ],
  },
  {
    id: "egs-contexts",
    tab: "egs",
    label: "Contexts",
    title: "Contexts and execution capacity",
    summary:
      "Contexts describe where, with whom, with what tool, in what mode, or at what energy level work can happen.",
    items: [
      {
        title: "Context types",
        body: [
          "Typical types include place, person, tool, mode, and energy. Practical examples include Office, Home, Calls, Errands, Laptop, Deep Focus, Client Office, or Low Energy.",
        ],
      },
      {
        title: "Significant contexts",
        body: [
          "Significant contexts are important enough to receive recommendation email sections. Mark them on the Contexts tab so Settings can summarise which contexts drive email output.",
        ],
      },
      {
        title: "Weekday minutes and weekend minutes",
        body: [
          "These are planning budgets for each context. A value of 0 means the planner should not normally allocate work to that context for that type of day.",
        ],
      },
      {
        title: "80% planning rule",
        body: [
          "Recommendation emails use about 80% of the configured context budget. The remaining capacity is deliberately left for interruption, uncertainty, and the normal messiness of a real day.",
        ],
      },
    ],
  },
  {
    id: "egs-review-troubleshooting",
    tab: "egs",
    label: "Review and troubleshooting",
    title: "Review discipline and recommendation troubleshooting",
    summary:
      "Review keeps the guidance model trustworthy. Most bad recommendations come from stale or imprecise data before they come from algorithm defects.",
    items: [
      {
        title: "Weekly review",
        body: [
          "Process Inbox, follow up Waiting, repair unrealistic Scheduled dates, restore next actions to active projects, move optional work to Someday, and clarify weak Next items.",
        ],
      },
      {
        title: "Why recommendations may look wrong",
        body: [
          "Common causes include an overloaded Inbox, vague task titles, projects with no path, artificial due dates, stale Waiting items, parent tasks marked as Next while child actions hold the real work, and missing context or duration metadata.",
        ],
      },
      {
        title: "First recovery move",
        body: [
          "Do a short repair pass before changing scoring logic. Clarify titles, fix states, reduce fake dates, identify the real next action, and check whether waiting work needs a follow-up.",
        ],
      },
    ],
    callout: {
      title: "Trust rule",
      body: "The system earns the right to guide only when open items mean something accurate and current.",
      tone: "warning",
    },
  },
  {
    id: "app-surfaces",
    tab: "app",
    label: "Application surfaces",
    title: "Application surfaces",
    summary:
      "The app is organised around Tasks, Today, Review, Contexts, and Settings. Each surface has a different operational responsibility.",
    items: [
      {
        title: "Tasks",
        body: [
          "Capture, clarify, edit, and structure work. This is where projects, actions, child actions, states, dates, priority, effort, remaining time, minimum duration, and context are modelled.",
        ],
      },
      {
        title: "Today",
        body: [
          "Use Today to decide what deserves attention now. It contains Best Next Action, Recommended Tasks, Guided Actions, Needs Attention where applicable, and Project Health.",
        ],
      },
      {
        title: "Review",
        body: [
          "Use Review to repair drift and keep the model trustworthy: Inbox, Waiting, Scheduled, stale projects, missing next actions, and weak Next items.",
        ],
      },
      {
        title: "Contexts",
        body: [
          "Create, classify, archive, and tune execution contexts. Mark significant contexts and set weekday/weekend minutes for email planning.",
        ],
      },
      {
        title: "Settings",
        body: [
          "Configure recommendation email schedule, recommendation count, send recommendation email now, and review significant context summary.",
        ],
      },
    ],
  },
  {
    id: "app-inbox",
    tab: "app",
    label: "Inbox processing",
    title: "Processing Inbox in the app",
    summary:
      "Inbox is a capture buffer. Processing means deciding the right destination and state for each captured item.",
    body: [
      "Common outcomes are delete, Reference, Someday, standalone Next or Scheduled action, new project, or child action under an existing project.",
      "When the item belongs to a project, file it into that project. This gives Today and Project Health a more accurate structural picture.",
    ],
  },
  {
    id: "app-emails",
    tab: "app",
    label: "Recommendation emails",
    title: "Recommendation emails",
    summary:
      "Emails provide a daily execution briefing, grouped by significant context and supported by suggested execution allocations.",
    body: [
      "Settings controls the schedule, recommendation count, and Send recommendation email now action. Contexts controls which contexts are significant and how many weekday/weekend minutes they normally have.",
      "Emails can include Best Next Action, top recommendations, significant-context recommendations, due or overdue work, waiting follow-ups, and suggested allocation blocks. Allocations are guidance, not calendar bookings.",
    ],
  },
  {
    id: "app-sharing",
    tab: "app",
    label: "Sharing",
    title: "Sharing",
    summary:
      "If sharing is enabled in your current app build, use it to give another person visibility of selected work without changing the core execution model.",
    body: [
      "Shared work should still be modelled carefully. A shared vague task is still vague; a shared project still needs a next action, scheduled commitment, or waiting dependency.",
      "Use sharing for coordination and visibility, not as a substitute for clarification, ownership, or review.",
    ],
  },
  {
    id: "app-reference",
    tab: "app",
    label: "Reference material",
    title: "Reference material and definitions",
    summary:
      "This section separates quick reference from conceptual guidance so the help page is easier to scan.",
    items: [
      {
        title: "Projects vs actions",
        body: [
          "A project is a multi-step outcome. An action is the executable unit. Today should recommend actions, not projects.",
        ],
      },
      {
        title: "Scheduled vs due date",
        body: [
          "Scheduled is when you intend to work on the item. Due date is when the commitment must be completed. They can be different.",
        ],
      },
      {
        title: "Reference vs Someday",
        body: [
          "Reference is information with no action. Someday is possible future work with no current commitment.",
        ],
      },
      {
        title: "Completed",
        body: [
          "Completed items remain useful for continuity, project history, and traceability.",
        ],
      },
    ],
  },
];

export default function HelpPage() {
  const [tab, setTab] = useState<HelpTab>("egs");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const lastUpdated = useMemo(() => new Date().toLocaleDateString("en-AU"), []);
  const inAppShell = location.pathname.startsWith("/app/");
  const searchTerm = normaliseSearch(search);

  const visibleChapters = useMemo(
    () =>
      helpChapters.filter((chapter) => {
        if (chapter.tab !== tab) {
          return false;
        }
        if (!searchTerm) {
          return true;
        }
        return chapterSearchText(chapter).includes(searchTerm);
      }),
    [searchTerm, tab],
  );

  const toc: TocItem[] = useMemo(
    () => [
      { id: "quick-answers", label: "Quick Answers" },
      { id: "workflow-recipes", label: "Workflow recipes" },
      ...visibleChapters.map((chapter) => ({
        id: chapter.id,
        label: chapter.label,
      })),
    ],
    [visibleChapters],
  );

  const jumpTo = (id: string) => {
    if (!id) {
      return;
    }
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <div className="help-page">
      {!inAppShell ? (
        <div className="help-utility-bar">
          <Link className="btn btn-secondary" to="/">
            Home
          </Link>
          <div className="help-utility-actions">
            {isAuthenticated ? (
              <button
                className="btn btn-primary"
                onClick={() => navigate("/app/today")}
              >
                Open Today
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => startLogin()}>
                Sign in
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="help-header">
        <div>
          <div className="help-eyebrow">Execution Guidance System</div>
          <h1>Help and operating guide</h1>
          <p className="help-intro">
            A searchable in-app knowledge base for EGS concepts, application
            usage, workflow recipes, recommendation logic, contexts, emails,
            review, and troubleshooting.
          </p>
        </div>
        <div className="help-updated">Last updated: {lastUpdated}</div>
      </div>

      <HelpSearch value={search} onChange={setSearch} />

      <div className="help-tab-row">
        <TabButton
          active={tab === "egs"}
          label="EGS Guide"
          onClick={() => {
            setTab("egs");
            setMobileOpen(false);
          }}
        />
        <TabButton
          active={tab === "app"}
          label="Using the App"
          onClick={() => {
            setTab("app");
            setMobileOpen(false);
          }}
        />
      </div>

      <div className="help-layout">
        <aside>
          <ContentsNav
            items={toc}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            onJump={jumpTo}
          />
        </aside>
        <main>
          <QuickAnswers answers={quickAnswers} />
          <WorkflowRecipes recipes={workflowRecipes} />

          {visibleChapters.length === 0 ? (
            <section className="help-section">
              <h2>No matching help content</h2>
              <p>
                Try a broader search term such as Today, context, Waiting,
                email, priority, or project.
              </p>
            </section>
          ) : (
            visibleChapters.map((chapter) => (
              <ChapterSection
                key={chapter.id}
                chapter={chapter}
                defaultOpen={Boolean(searchTerm)}
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}
