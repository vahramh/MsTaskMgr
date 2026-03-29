import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { startLogin } from "../../auth/cognitoHostedUi";

type HelpTab = "egs" | "app";

type TocItem = {
  id: string;
  label: string;
};

type SectionProps = {
  id: string;
  title: string;
  children: React.ReactNode;
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
      type="button"
      className={active ? "btn btn-primary" : "btn btn-secondary"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="help-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Callout({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warning";
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
          onClick={() => setMobileOpen((value) => !value)}
          style={{ width: "100%", justifyContent: "space-between", display: "flex" }}
        >
          <span>Contents</span>
          <span>{mobileOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      <nav className={`help-toc ${mobileOpen ? "help-toc-open" : ""}`} aria-label="Help contents">
        <div className="help-toc-title">Contents</div>
        <div className="help-toc-links">
          {items.map((item) => (
            <a key={item.id} href={`#${item.id}`} onClick={() => setMobileOpen(false)}>
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}

function SystemFlow() {
  const steps = [
    {
      step: "01",
      title: "Capture",
      body: "Collect commitments quickly so attention is not spent trying to remember everything in parallel.",
    },
    {
      step: "02",
      title: "Clarify",
      body: "Decide what the item actually means: a single action, a project, waiting, scheduled, someday, or reference.",
    },
    {
      step: "03",
      title: "Organise",
      body: "Maintain states, dates, hierarchy, and metadata accurately enough that the system can interpret the work landscape.",
    },
    {
      step: "04",
      title: "Execute",
      body: "Use Today to start with the strongest move rather than re-triaging your entire list every time you sit down.",
    },
    {
      step: "05",
      title: "Review",
      body: "Repair drift, stale commitments, and missing paths so the guidance remains trustworthy under pressure.",
    },
  ];

  return (
    <div className="help-flow-shell">
      <div className="help-flow-header">
        <div className="help-flow-title">Operating cycle</div>
        <div className="help-flow-subtitle">
          EGS works as an execution rhythm. Each stage protects the quality of the next one.
        </div>
      </div>
      <div className="help-flow-grid">
        {steps.map((step) => (
          <article key={step.step} className="help-flow-card">
            <div className="help-flow-step">{step.step}</div>
            <div className="help-flow-card-title">{step.title}</div>
            <div className="help-flow-body">{step.body}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ScoringModel() {
  const rows = [
    {
      title: "Readiness and eligibility",
      body: "Only plausible candidates should be ranked. A task must first survive readiness checks before it can credibly compete for Today attention.",
    },
    {
      title: "Due pressure",
      body: "Overdue and due-today items receive substantial score lifts, but lateness alone does not always override poor readiness.",
    },
    {
      title: "Focus-window fit",
      body: "Minimum duration and effort influence whether the task suits a short gap or a deeper work block.",
    },
    {
      title: "Definition quality",
      body: "Context, effort, and minimum duration all increase confidence that the task can begin without rethinking.",
    },
    {
      title: "Project leverage",
      body: "Tasks that restore momentum, clarify an ambiguous project, or reduce deadline risk gain additional weight.",
    },
    {
      title: "Friction penalties",
      body: "Blocked ancestry, unresolved child structure, repeated deferral, and oversized work blocks reduce score even when the task looks important.",
    },
  ];

  return (
    <div className="help-flow-shell">
      <div className="help-flow-header">
        <div className="help-flow-title">Guidance model</div>
        <div className="help-flow-subtitle">
          Today uses a layered scoring model rather than a single ranking rule.
        </div>
      </div>
      <div className="help-flow-grid">
        {rows.map((row, index) => (
          <article key={row.title} className="help-flow-card">
            <div className="help-flow-step">0{index + 1}</div>
            <div className="help-flow-card-title">{row.title}</div>
            <div className="help-flow-body">{row.body}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ScoreList({
  items,
}: {
  items: Array<{ label: string; detail: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {items.map((item) => (
        <div key={item.label} className="help-flow-card">
          <div className="help-flow-card-title">{item.label}</div>
          <div className="help-flow-body">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function EgsGuideTab() {
  return (
    <div>
      <Section id="egs-what-it-is" title="What EGS is">
        <p>
          The Execution Guidance System is a professional decision-support workflow for people who
          carry many commitments, projects, obligations, and follow-ups. It is designed to answer a
          harder question than a generic task list: <strong>what deserves attention next?</strong>
        </p>
        <p>
          Most productivity tools are primarily storage systems. They help the user capture and sort
          work, but they still leave most of the cognitive burden with the user. EGS is built to do
          more. It interprets the task landscape and surfaces recommendations, alternatives, and
          maintenance signals so the user spends less time re-sorting work and more time executing
          meaningful moves.
        </p>
        <p>
          The system combines disciplined capture, explicit workflow states, project structure,
          review practice, execution metadata, and ranking logic. When the underlying data is kept
          clean, EGS behaves less like a list manager and more like an execution instrument.
        </p>
        <Callout title="Core promise" tone="accent">
          A trusted system should reduce cognitive drag. When EGS is current, it helps you decide,
          not merely remember.
        </Callout>
      </Section>

      <Section id="egs-execution-model" title="The execution model">
        <p>
          EGS is based on the idea that most productivity failure does not come from lack of effort.
          It comes from repeated decision friction. People sit down to work and then burn time
          scanning lists, re-reading projects, remembering dependencies, re-estimating urgency, and
          trying to reconstruct what matters most.
        </p>
        <p>
          EGS moves part of that interpretive work into the system itself. It uses workflow state,
          due pressure, effort, minimum duration, project health, waiting signals, definition
          quality, and structural readiness to estimate which options are credible now and which
          parts of the system need repair first.
        </p>
        <p>
          This does not mean EGS tries to automate judgement completely. It does not attempt to
          replace human discernment. Instead, it narrows the field intelligently so the user is
          choosing among better options rather than constantly starting from a blank prioritisation
          problem.
        </p>
        <Callout title="Design intent">
          The target outcome is not perfect ranking. It is lower decision cost, stronger execution
          starts, and earlier detection of hidden risk.
        </Callout>
      </Section>

      <Section id="egs-operating-cycle" title="Operating cycle">
        <p>
          EGS works best when used as a loop: capture, clarify, organise, execute, and review.
          Skipping one stage usually weakens the quality of the next. For example, poor clarification
          produces vague next actions; weak organisation produces misleading recommendations; weak
          review allows drift to accumulate until Today stops feeling believable.
        </p>
        <SystemFlow />
      </Section>

      <Section id="egs-states" title="Core states and why they matter">
        <p>
          Workflow state is one of the foundations of the guidance model. A state is not only a
          storage label. It tells the system how to interpret a commitment and whether the item
          should influence execution guidance, review maintenance, or long-term tracking.
        </p>
        <ul>
          <li>
            <strong>Inbox</strong> — captured but not yet clarified. Inbox is temporary holding, not
            permanent storage. Items here are not treated as executable because the system does not
            yet know what they mean.
          </li>
          <li>
            <strong>Next</strong> — executable now. These are the strongest candidates for Today,
            provided they are clearly defined and not blocked by hidden dependencies.
          </li>
          <li>
            <strong>Scheduled</strong> — date matters materially. This state should represent real
            time pressure, not optimistic intention. Overusing it weakens trust.
          </li>
          <li>
            <strong>Waiting</strong> — blocked by another person, event, or dependency. Waiting
            items matter less for direct execution and more for follow-up discipline and project
            health.
          </li>
          <li>
            <strong>Someday</strong> — worth keeping without current commitment. This protects the
            active system from overload by separating possibility from obligation.
          </li>
          <li>
            <strong>Reference</strong> — keep the information, not the action. Reference items are
            not part of prioritisation.
          </li>
          <li>
            <strong>Completed</strong> — finished work retained for traceability, continuity, and
            project memory.
          </li>
        </ul>
        <Callout title="Practical rule">
          Inbox should move. If it stays full, recommendation quality and trust both deteriorate
          because the system is forced to operate around unresolved ambiguity.
        </Callout>
      </Section>

      <Section id="egs-projects-next-actions" title="Projects, paths, and executable movement">
        <p>
          A project is any outcome that requires more than one action. The important design idea in
          EGS is that an active project must have a believable path forward. That path can take one
          of several forms: a concrete next action, a real scheduled commitment, or a genuine
          waiting dependency. Without one of those, the project is open but not operational.
        </p>
        <p>
          This matters because project health is not measured only by whether the project exists. It
          is measured by whether movement is possible and whether that movement is visible to the
          system. When a project has no path, Today becomes weaker because it cannot surface a
          credible action from that outcome.
        </p>
        <p>
          Clear next actions are especially important. A strong next action has a visible verb and a
          real completion condition. Examples include <em>Draft client summary</em>, <em>Review
          security notes</em>, <em>Call supplier about lead times</em>, or <em>Send architecture
          update</em>. Weak placeholders such as <em>Work on project</em> or <em>Deal with admin</em>
          reduce execution quality because they still require interpretation at the moment of action.
        </p>
        <Callout title="Good operating rule" tone="accent">
          If a project is genuinely active, someone should be able to point to the next movement in
          plain language.
        </Callout>
      </Section>

      <Section id="egs-readiness-model" title="Task readiness and structural dependency">
        <p>
          EGS does not yet use a full explicit dependency graph such as “Task B depends on Task A”.
          Instead, it now uses a pragmatic <strong>structural readiness model</strong>. This means
          the system asks whether a task is genuinely executable given its place in the hierarchy,
          its surrounding states, and how well defined it is.
        </p>
        <p>
          In practice, a task can be weakened or blocked by three broad classes of condition:
        </p>
        <ul>
          <li>
            <strong>Ancestor condition</strong> — a parent or higher ancestor is still in Inbox,
            Waiting, Someday, Reference, or Completed, so the child does not sit on a clean
            executable path.
          </li>
          <li>
            <strong>Child condition</strong> — the task has open children, especially actionable
            children, which suggests the real executable unit may be lower in the tree.
          </li>
          <li>
            <strong>Definition condition</strong> — the task lacks enough metadata to be trusted as
            immediately startable.
          </li>
        </ul>
        <p>
          This approach is deliberately pragmatic. It materially improves Today trust without
          requiring a major domain rewrite. The system becomes better at distinguishing
          “important-looking” from “actually executable now”.
        </p>
        <Callout title="Key distinction" tone="accent">
          Readiness is not the same as urgency. A task can be urgent but still not genuinely ready.
        </Callout>
      </Section>

      <Section id="egs-prioritisation" title="How prioritisation works conceptually">
        <p>
          EGS does not rely on one simplistic ranking rule such as due date, user priority, or
          creation order. It uses several signals together so the recommendation reflects a more
          realistic execution judgement. The intent is not to show everything. The intent is to
          reduce ambiguity around the next good move.
        </p>
        <ul>
          <li>
            <strong>Readiness</strong> — whether the task can actually begin now.
          </li>
          <li>
            <strong>Urgency</strong> — due pressure, lateness, and time sensitivity.
          </li>
          <li>
            <strong>Leverage</strong> — how strongly the task advances an active outcome or unblocks
            other movement.
          </li>
          <li>
            <strong>Staleness and momentum</strong> — whether the surrounding project is drifting,
            healthy, or recovering.
          </li>
          <li>
            <strong>Effort and minimum duration fit</strong> — whether the task suits the likely
            execution window.
          </li>
          <li>
            <strong>Metadata confidence</strong> — clearer tasks usually rank more credibly than
            vague ones.
          </li>
        </ul>
      </Section>

      <Section id="egs-scoring-model" title="How guidance scoring works in practice">
        <p>
          Today uses a multi-factor scoring model. No single field determines ranking. Instead,
          tasks accumulate score contributions from several dimensions, and some items are excluded
          entirely before scoring because they are not actually executable. This is important:
          ranking should happen among plausible candidates, not among everything in the database.
        </p>
        <ScoringModel />
        <p>
          The scoring model can be understood in five stages:
        </p>
        <ol>
          <li>determine whether the task is eligible for Today ranking at all</li>
          <li>estimate execution readiness</li>
          <li>add positive score contributions</li>
          <li>apply friction penalties</li>
          <li>select Best Next Action from only the stronger readiness tiers</li>
        </ol>

        <h3>1. Eligibility gate</h3>
        <p>
          Before a task is scored, the system excludes items that are not suitable for direct
          execution ranking. In practice, a task is not considered a Today execution candidate if it
          is a project, completed, reference, someday, inbox, or waiting. The main candidate pool
          is therefore actions in <strong>Next</strong> or <strong>Scheduled</strong>.
        </p>
        <p>
          This matters because it prevents the ranking engine from pretending that every open record
          is a reasonable execution option.
        </p>

        <h3>2. Readiness tiers</h3>
        <p>
          Each candidate task is then assessed for execution readiness. The system uses four tiers:
        </p>

        <ScoreList
          items={[
            {
              label: "Ready",
              detail:
                "Leaf-like task, not structurally blocked, and has all three core readiness metadata fields: context, effort, and minimum duration.",
            },
            {
              label: "WeakReady",
              detail:
                "Not structurally blocked and has partial but reasonably usable metadata, or is time-sensitive enough to remain plausible despite some missing definition.",
            },
            {
              label: "NotReady",
              detail:
                "Task may be important, but it still has unresolved child structure, weak definition, or other signs that it is not yet a clean immediate execution unit.",
            },
            {
              label: "Blocked",
              detail:
                "Task is suppressed by ancestor state, blocking child state, or its own blocked state such as Waiting.",
            },
          ]}
        />

        <p>
          Best Next Action is selected only from tasks assessed as <strong>Ready</strong> or
          <strong> WeakReady</strong>. This is one of the most important trust improvements in the
          system.
        </p>

        <h3>3. Base readiness score</h3>
        <p>
          The first major score contribution comes from state plus readiness quality:
        </p>

        <ScoreList
          items={[
            {
              label: "Base by state",
              detail:
                "Next starts at +40. Scheduled starts at +20. This reflects the stronger assumption that Next should be immediately executable.",
            },
            {
              label: "Readiness tier adjustment",
              detail:
                "Ready adds +18. WeakReady adds +8. NotReady subtracts 18. Blocked subtracts 42.",
            },
            {
              label: "Metadata reinforcement",
              detail:
                "Context adds +6, effort adds +4, and minimum duration adds +6 when the readiness-tier path is used. If no project-context readiness is available, fallback scoring uses context +8, effort +6, minimum duration +8, with penalties for missing fields.",
            },
          ]}
        />

        <h3>4. Due pressure contribution</h3>
        <p>
          Real time sensitivity can materially raise a task’s score:
        </p>

        <ScoreList
          items={[
            { label: "Overdue", detail: "Adds +34." },
            { label: "Due today", detail: "Adds +28." },
            { label: "Due tomorrow", detail: "Adds +22." },
            { label: "Due within 3 days", detail: "Adds +14." },
            { label: "Due within 7 days", detail: "Adds +6." },
          ]}
        />

        <p>
          Due pressure is strong, but it is not absolute. A structurally poor task can still be held
          back even if it is late.
        </p>

        <h3>5. Focus-window fit contribution</h3>
        <p>
          EGS tries to prefer tasks that fit real execution windows rather than assuming all work
          should be treated alike. Minimum duration is preferred over effort when both are present,
          because it is a better indicator of the smallest uninterrupted block required to start
          properly.
        </p>

        <ScoreList
          items={[
            { label: "Minimum duration ≤ 15 min", detail: "Adds +14." },
            { label: "Minimum duration ≤ 30 min", detail: "Adds +20." },
            { label: "Minimum duration ≤ 60 min", detail: "Adds +18." },
            { label: "Minimum duration ≤ 90 min", detail: "Adds +8." },
            { label: "Minimum duration ≤ 120 min", detail: "Adds -4." },
            { label: "Minimum duration > 120 min", detail: "Adds -12." },
            { label: "Effort fallback ≤ 15 min", detail: "Adds +10 when no minimum duration is available." },
            { label: "Effort fallback ≤ 30 min", detail: "Adds +14." },
            { label: "Effort fallback ≤ 60 min", detail: "Adds +12." },
            { label: "Effort fallback ≤ 120 min", detail: "Adds +4." },
            { label: "Effort fallback > 120 min", detail: "Adds -6." },
          ]}
        />

        <p>
          This means the model tends to favour tasks that fit an identifiable block of time rather
          than sprawling ambiguous work.
        </p>

        <h3>6. Metadata quality contribution</h3>
        <p>
          EGS rewards tasks that are well specified because they are easier to start cleanly:
        </p>

        <ScoreList
          items={[
            {
              label: "All 3 fields present",
              detail:
                "Context + effort + minimum duration together add +10 for Well defined and +10 for Ready to start, for a total of +20 from the metadata-quality layer.",
            },
            {
              label: "Any 2 fields present",
              detail: "Adds +5 for Ready to start.",
            },
            {
              label: "Only 1 field present",
              detail: "Adds +1 for Ready to start.",
            },
            {
              label: "No fields present",
              detail: "No metadata-quality boost is granted.",
            },
          ]}
        />

        <h3>7. Priority contribution</h3>
        <p>
          User priority still matters, but it is treated as one signal among several:
        </p>

        <ScoreList
          items={[
            { label: "Priority 5", detail: "Adds +26." },
            { label: "Priority 4", detail: "Adds +20." },
            { label: "Priority 3", detail: "Adds +14." },
            { label: "Priority 2", detail: "Adds +8." },
            { label: "Priority 1", detail: "Adds +4." },
          ]}
        />

        <h3>8. Momentum and project-leverage contribution</h3>
        <p>
          The model also rewards tasks that have special leverage within their project context:
        </p>

        <ScoreList
          items={[
            {
              label: "Only clear next step",
              detail:
                "Adds +14 when the task is the only actionable or only Next task in the project context.",
            },
            {
              label: "Restores momentum",
              detail:
                "Adds +10 when the task is the lead action in a project with low momentum.",
            },
            {
              label: "Clarifies project",
              detail:
                "Adds +8 when the task is the lead action in a project that still needs clarification or a visible path.",
            },
            {
              label: "Reduces deadline risk",
              detail:
                "Adds +8 when the project context is under deadline pressure.",
            },
            {
              label: "Scheduled for today",
              detail:
                "Adds +6 when the task is Scheduled and the scheduled date is today.",
            },
            {
              label: "Task age / momentum nudge",
              detail:
                "Older open tasks gain a modest nudge: +4 at 7+ days, +8 at 14+ days, +10 at 30+ days, and +8 at 60+ days. This is not a stale-task rule; it is a mild encouragement not to let defined work drift forever.",
            },
          ]}
        />

        <h3>9. Friction penalties</h3>
        <p>
          Positive scores are then offset by structural and behavioural friction penalties:
        </p>

        <ScoreList
          items={[
            {
              label: "Scheduled in the future",
              detail:
                "Subtracts 8 when the task is Scheduled but the date is still in the future.",
            },
            {
              label: "Scheduled for today",
              detail:
                "Adds back +4 inside the penalty layer, partly offsetting the future-date penalty logic.",
            },
            {
              label: "Repeated deferral",
              detail:
                "If defer count is 2 or 3, subtract 4. If defer count is 4 or more, subtract 10.",
            },
            {
              label: "Oversized task block",
              detail:
                "Subtracts 10 when minimum duration is at least 120 minutes, or when effort is very large without a clearer block definition.",
            },
            {
              label: "Blocked ancestor state",
              detail:
                "Subtracts 20 when a parent or higher ancestor is in a blocking or structurally unsuitable state.",
            },
            {
              label: "Blocked descendant state",
              detail:
                "Subtracts 18 when a child state indicates unresolved blockage beneath the task.",
            },
            {
              label: "Actionable children exist",
              detail:
                "Subtracts 14 when the task has actionable children, suggesting the true execution unit is lower in the tree.",
            },
            {
              label: "Open children exist",
              detail:
                "Subtracts 10 when the task still has unresolved open children but not clearly actionable children.",
            },
            {
              label: "Missing readiness metadata",
              detail:
                "Subtracts 3 for each missing readiness field within the structural readiness model.",
            },
          ]}
        />

        <h3>10. Best Next Action threshold</h3>
        <p>
          After scoring, the system does not automatically take the top-ranked item as Best Next
          Action. The task must also:
        </p>
        <ul>
          <li>be eligible for Today execution ranking</li>
          <li>be classified as Ready or WeakReady</li>
          <li>score at least <strong>35</strong></li>
        </ul>
        <p>
          This threshold prevents the interface from confidently presenting a low-quality task as the
          one best move merely because everything else is even weaker.
        </p>

        <Callout title="What the score is trying to do" tone="accent">
          The score is not a claim of objective truth. It is a structured estimate of execution
          credibility.
        </Callout>
      </Section>

      <Section id="egs-best-next-action" title="Best Next Action logic">
        <p>
          Best Next Action is the highest-confidence recommendation on the Today page. It should feel
          plausible, not theatrical. Its job is to answer the question: <strong>if I want to begin
          well right now, what is the strongest move?</strong>
        </p>
        <p>
          To reach this position, a task usually needs a combination of high readiness, good
          definition quality, useful leverage, and acceptable effort fit. Due pressure can increase
          urgency, but EGS aims to avoid a model where every late item automatically dominates. A
          believable recommendation balances importance, urgency, and practical startability.
        </p>
        <p>
          The strongest Best Next Action candidates therefore tend to have this shape:
        </p>
        <ul>
          <li>the task is in Next, or occasionally Scheduled for today</li>
          <li>it is a leaf or near-leaf execution unit</li>
          <li>it has no blocking ancestor condition</li>
          <li>it has no unresolved child structure that makes it too coarse</li>
          <li>it has at least moderate metadata quality</li>
          <li>it sits in a meaningful project context or carries real due pressure</li>
        </ul>
        <p>
          If Best Next Action repeatedly feels wrong, the first diagnosis should usually be data
          quality rather than scoring failure. Common causes include vague tasks, overused scheduled
          dates, stale waiting items, and projects with missing executable paths.
        </p>
        <p>
          Today now also distinguishes between a true <strong>execution recommendation</strong> and a
          <strong> maintenance recommendation</strong>. When no ready or weak-ready task is credible
          enough to own the top slot, the page will elevate a <strong>Best Next Move</strong>
          instead. This is typically a follow-up on overdue waiting work, an unblock move, project
          clarification, or inbox repair.
        </p>
      </Section>

      <Section id="egs-guided-actions" title="Guided actions and maintenance signals">
        <p>
          EGS is not only concerned with direct execution. It also protects the quality of the
          system itself. Guided Actions therefore surface maintenance interventions that keep the
          guidance trustworthy.
        </p>
        <p>
          Current Guided Actions can include:
        </p>
        <ul>
          <li>
            <strong>Process Inbox</strong> — Inbox items still require clarification.
          </li>
          <li>
            <strong>Follow Up Waiting</strong> — waiting items are old enough that they should
            likely be nudged.
          </li>
          <li>
            <strong>Clarify Projects</strong> — projects have open work but no clean visible next
            path.
          </li>
          <li>
            <strong>Restore Project Momentum</strong> — projects are cold or stalled and need a
            restart move.
          </li>
          <li>
            <strong>Unblock Waiting Projects</strong> — project progress is constrained by waiting
            work.
          </li>
          <li>
            <strong>Break Down Large Tasks</strong> — repeatedly deferred oversized work likely needs
            decomposition.
          </li>
          <li>
            <strong>Prepare Next Actions</strong> — tasks are marked Next or Scheduled but are not
            fully execution-ready yet.
          </li>
        </ul>
        <p>
          The new <strong>Prepare Next Actions</strong> signal is especially important. It identifies
          one of the classic trust failures in task systems: something is labelled as actionable, but
          in practice it is still structurally weak, under-defined, or blocked by unresolved tree
          structure.
        </p>
        <p>
          Guided Actions now have a second role as well. If no credible execution candidate exists,
          Today can promote the strongest maintenance intervention into the primary recommendation
          area as <strong>Best Next Move</strong> rather than misleadingly implying that nothing useful
          can be done.
        </p>
        <p>
          Waiting items that are overdue or stale are also surfaced directly in a dedicated
          <strong>Needs Attention</strong> panel. This closes an important trust gap: anything that
          contributes to Today stress should be visible from Today, even when it is not a valid
          execution candidate.
        </p>
        <Callout title="Why Guided Actions matter">
          A mature execution system must sometimes tell you to repair the system before it tells you
          to do more work inside it.
        </Callout>
      </Section>

      <Section id="egs-project-health" title="Project Health and what it means">
        <p>
          Project Health summarises whether an outcome has believable forward motion, real blockage,
          deadline risk, or structural ambiguity. It is not a decorative dashboard. It is a
          diagnostic surface for protecting execution reliability.
        </p>
        <p>
          Project Health uses four key dimensions:
        </p>

        <ScoreList
          items={[
            {
              label: "Momentum",
              detail:
                "Strong, warm, cold, or stalled. This reflects recent completion and recent activity in the project.",
            },
            {
              label: "Clarity",
              detail:
                "Clear, needs next action, needs clarification, blocked, or parked. This reflects whether the project has a believable execution path.",
            },
            {
              label: "Readiness",
              detail:
                "Ready, weakReady, blocked, or notReady at the project level, derived mainly from presence and definition quality of next actions.",
            },
            {
              label: "Blockage",
              detail:
                "None, waiting, or waitingRisk, depending on whether forward motion is dominated by waiting items and whether those waiting items are stale enough to follow up.",
            },
          ]}
        />

        <p>
          Project severity rises when there is deadline pressure, waiting risk, missing path, low
          momentum, or too much open work with not enough executable structure.
        </p>
      </Section>

      <Section id="egs-review-discipline" title="Review discipline and system trust">
        <p>
          Review is the mechanism that keeps EGS believable. Without review, Inbox items linger,
          waiting work goes stale, projects lose executable paths, scheduled work becomes dishonest,
          and Today becomes less credible. In that sense, review is not administrative overhead. It
          is how the system earns the right to guide.
        </p>
        <p>A strong review rhythm typically includes:</p>
        <ul>
          <li>processing Inbox close to zero</li>
          <li>checking waiting items that need a nudge</li>
          <li>repairing scheduled work that is no longer realistic</li>
          <li>restoring clear next actions to active projects</li>
          <li>reclassifying stale optional work into Someday when appropriate</li>
          <li>repairing Next items that are still too vague or structurally weak</li>
        </ul>
        <Callout title="Important principle">
          The system becomes trustworthy when the user can assume that open items mean something
          accurate and current.
        </Callout>
      </Section>

      <Section id="egs-inbox-to-project" title="Inbox triage into projects">
        <p>
          EGS now supports a practical triage move for captured work: filing an Inbox action under an
          existing project. This matters because many captured items are not standalone tasks. They
          are really steps inside an existing outcome.
        </p>
        <p>
          The intent is:
        </p>
        <ol>
          <li>capture quickly into Inbox when speed matters</li>
          <li>later decide that the item belongs within a known project</li>
          <li>file it under that project as a child action</li>
          <li>choose the resulting workflow state there</li>
        </ol>
        <p>
          This produces a better operating model than forcing the user to either leave the item as a
          standalone action or manually recreate it later under the project tree.
        </p>
        <p>
          Conceptually, this strengthens the system in three ways:
        </p>
        <ul>
          <li>Inbox processing becomes faster and more realistic</li>
          <li>project continuity improves because captured work can be placed where it belongs</li>
          <li>Today and Project Health gain a more accurate structural picture</li>
        </ul>
        <Callout title="Practical rule" tone="accent">
          If a captured item is really part of an existing outcome, file it under the project rather
          than leaving it as an isolated standalone action.
        </Callout>
      </Section>

      <Section id="egs-scoring-examples" title="Scoring examples">
        <p>
          It is often easier to understand the scoring model through examples than through raw rules.
        </p>

        <h3>Example 1 — strong Best Next Action candidate</h3>
        <p>
          A Next task with context, effort, minimum duration, priority 4, and a 30-minute block
          requirement will often rank strongly. If it is also the clearest step in a project that
          needs momentum, it may gain additional leverage points and become a natural Best Next
          Action.
        </p>

        <h3>Example 2 — urgent but structurally weak task</h3>
        <p>
          Suppose a task is overdue and therefore gains a large due-pressure boost. But it also has
          actionable children, missing metadata, and a blocking ancestor condition. The urgency
          points help, but the structural penalties may still keep it out of Best Next Action. This
          is intentional. The system is saying: this matters, but it still is not a clean immediate
          move.
        </p>

        <h3>Example 3 — scheduled task in the future</h3>
        <p>
          A Scheduled task with a future date begins with a lower base than Next and also receives a
          future-date penalty. That does not mean it disappears. It means EGS is less likely to
          treat it as the best current move before its scheduled window arrives.
        </p>

        <h3>Example 4 — repeated deferral of large work</h3>
        <p>
          A task with a very large minimum duration and several recorded deferrals is penalised
          heavily enough that it will usually stop dominating Today. At that point, Guided Actions
          may instead encourage breakdown or repair rather than continued theatrical intention.
        </p>
      </Section>

      <Section id="egs-common-failures" title="Common failure modes">
        <p>Recommendation quality usually degrades for a small number of predictable reasons:</p>
        <ul>
          <li>using Inbox as a permanent parking lot</li>
          <li>keeping projects open without a visible next move</li>
          <li>scheduling aspirational work too aggressively</li>
          <li>writing vague tasks that cannot be started in one sitting</li>
          <li>treating waiting as a place to forget rather than a place to follow up from</li>
          <li>marking parent tasks as Next when the real executable work lives in children</li>
          <li>leaving Next items under blocked or unclear ancestors</li>
          <li>adding excessive metadata that does not improve execution quality</li>
          <li>ignoring review until trust in the system erodes</li>
        </ul>
        <p>
          Most of these failures are not technical failures. They are modelling failures. The system
          usually performs best when the user simplifies and clarifies the data before demanding
          more complexity from the scoring model.
        </p>
      </Section>

      <Section id="egs-philosophy" title="Philosophy of use">
        <p>
          EGS is intended to be a thinking instrument, not a productivity scoreboard. It should not
          make the user perform busyness. It should make it easier to see where attention, effort,
          and judgement will have the best effect.
        </p>
        <p>The system works best when:</p>
        <ul>
          <li>capture is fast</li>
          <li>clarification is honest</li>
          <li>projects have real executable paths</li>
          <li>scheduling is conservative</li>
          <li>Next means genuinely executable, not merely important</li>
          <li>review is regular enough that Today remains believable</li>
        </ul>
        <Callout title="Working standard" tone="accent">
          When EGS is healthy, Today should feel like a calm briefing, not another pile of tasks to
          manually triage.
        </Callout>
      </Section>
    </div>
  );
}

function AppGuideTab() {
  return (
    <div>
      <Section id="app-mental-model" title="Mental model">
        <p>
          The application is organised around three operational surfaces: <strong>Tasks</strong>,
          <strong> Today</strong>, and <strong>Review</strong>. Together they support structure,
          execution, and maintenance without collapsing everything into one flat list.
        </p>
        <p>
          A useful way to think about the app is this: Tasks is where work is shaped, Today is where
          attention is directed, and Review is where trust is restored. Each surface has a different
          responsibility, and mixing them together too heavily usually makes the interface noisier
          and less credible.
        </p>
        <Callout title="Simple framing" tone="accent">
          Tasks is where work is modelled. Today is where work is chosen. Review is where the system
          is repaired.
        </Callout>
      </Section>

      <Section id="app-tasks-page" title="Tasks page">
        <p>
          Use Tasks to capture, clarify, edit, and maintain hierarchy. Keep titles concrete, assign
          workflow state intentionally, and use project structure to make execution easier rather
          than noisier. The quality of Today depends heavily on the quality of modelling here.
        </p>
        <p>Good practice on the Tasks page includes:</p>
        <ul>
          <li>capturing quickly into Inbox when speed matters</li>
          <li>clarifying items before expecting them to influence Today well</li>
          <li>using projects only for true multi-step outcomes</li>
          <li>using subtasks to express real structure rather than ornamental nesting</li>
          <li>keeping wording explicit enough that a future you can act without rethinking</li>
          <li>using Next sparingly and honestly for things that can really begin now</li>
        </ul>
      </Section>

      <Section id="app-inbox-processing" title="Processing Inbox well">
        <p>
          Inbox is a capture buffer, not a working list. When processing Inbox, the aim is to decide
          what each item actually is. Common outcomes are:
        </p>
        <ul>
          <li>discard it if it no longer matters</li>
          <li>move it to Reference if it is information, not action</li>
          <li>mark it Someday if it is optional rather than current</li>
          <li>turn it into a standalone Next or Scheduled action</li>
          <li>turn it into a project if it is really a multi-step outcome</li>
          <li>file it under an existing project if it is really part of that outcome</li>
        </ul>
        <p>
          The new project-filing capability is especially useful for real-world capture, where many
          ideas arrive without structure and are best placed properly only during later clarification.
        </p>
      </Section>

      <Section id="app-today-page" title="Today page">
        <p>
          Today is the primary execution surface. It is designed to reduce friction at the moment of
          work. Rather than presenting a raw list of everything that is open, it surfaces ranked
          recommendations, execution alternatives, and system maintenance cues.
        </p>
        <ul>
          <li>
            <strong>Best Next Action</strong> surfaces the strongest immediate move based on current
            evidence.
          </li>
          <li>
            <strong>Best Next Move</strong> appears when no credible execution candidate is strong
            enough, and elevates the best maintenance action instead.
          </li>
          <li>
            <strong>Needs Attention</strong> surfaces overdue or stale waiting items that are driving
            system stress but should not masquerade as direct execution work.
          </li>
          <li>
            <strong>Recommended Tasks</strong> provide ranked alternatives if the top move is not the
            right fit for the current energy, context, or time window.
          </li>
          <li>
            <strong>Guided Actions</strong> point to maintenance interventions such as follow-ups,
            missing paths, stale projects, and other execution repairs.
          </li>
          <li>
            <strong>Project Health</strong> highlights where important outcomes may be drifting even
            before the user feels obvious overload.
          </li>
        </ul>
        <p>
          The purpose of Today is not to take control away from the user. It is to start the day, or
          the next work session, with a narrower and more credible field of action.
        </p>
        <p>
          An important design rule now applies: <strong>if an item contributes to Today stress, the
          user should be able to see it or act on it from Today</strong>. That is why overdue waiting
          items can appear in Needs Attention and why the primary card can fall back from Best Next
          Action to Best Next Move.
        </p>
      </Section>

      <Section id="app-execution-signals" title="Understanding execution signals">
        <p>
          EGS uses several classes of signal. They should be read as diagnostic guidance rather than
          decoration.
        </p>
        <ul>
          <li>
            <strong>Execution signals</strong> indicate strong immediate candidates for work.
          </li>
          <li>
            <strong>Momentum signals</strong> suggest that continuing movement in a project is useful
            and timely.
          </li>
          <li>
            <strong>Risk signals</strong> appear when deadlines, staleness, or blocked paths threaten
            the credibility of an outcome.
          </li>
          <li>
            <strong>Maintenance signals</strong> indicate that the system itself needs attention:
            Inbox processing, waiting follow-up, date repair, project path repair, or preparation of
            weak Next items.
          </li>
        </ul>
        <p>
          A strong interface keeps these signals calm and sparse. Not every item needs colour or a
          badge. The system should highlight what changes the next decision.
        </p>
      </Section>

      <Section id="app-project-health" title="Reading project health">
        <p>
          Project Health is a decision signal, not a decorative status light. A healthy project is
          one with a believable path, recent movement or justified waiting, and no immediate sign of
          hidden decay. An at-risk project usually has a missing path, stale momentum, deadline
          pressure, or a waiting dependency that has not been managed actively.
        </p>
        <p>
          The correct response to Project Health is diagnostic action. When a project is flagged,
          ask: does it still have a next move, does it need a follow-up, is the date honest, is the
          lead step structurally executable, and is the wording specific enough for execution?
        </p>
        <Callout title="Use it diagnostically">
          Project Health is most useful when it triggers a repair: add the next action, follow up,
          renegotiate the date, simplify the project model, or file the next captured step into the
          right place.
        </Callout>
      </Section>

      <Section id="app-metadata" title="Metadata that matters">
        <p>
          Metadata helps only when it improves decision quality. EGS is not trying to maximise data
          entry. It is trying to capture the pieces of information that materially affect what can be
          done and when it makes sense to do it.
        </p>
        <ul>
          <li>
            <strong>Context</strong> improves filtering by circumstance, such as calls, errands,
            office work, or deep work.
          </li>
          <li>
            <strong>Effort</strong> gives a rough size estimate so larger tasks do not accidentally
            crowd out smaller executable steps.
          </li>
          <li>
            <strong>Minimum duration</strong> protects tasks that require a real uninterrupted block,
            such as analysis, writing, design, and architecture work.
          </li>
          <li>
            <strong>Priority</strong> helps, but should not replace judgement. It is one signal among
            several.
          </li>
          <li>
            <strong>Dates</strong> matter when they reflect genuine commitments. Artificial dates
            produce artificial urgency.
          </li>
        </ul>
        <Callout title="Metadata rule" tone="warning">
          Add metadata that changes decisions. Skip metadata that merely makes the record look more
          complete.
        </Callout>
      </Section>

      <Section id="app-review-page" title="Review page">
        <p>
          Review is for maintenance rather than browsing. It gives the user a place to repair drift,
          restore accurate states, and preserve trust in the system before recommendation quality
          drops. In a mature EGS workflow, Review is one of the highest-leverage habits because it
          directly affects the usefulness of Today.
        </p>
        <ul>
          <li>process Inbox captured quickly during the week</li>
          <li>check waiting items that need a nudge</li>
          <li>repair scheduled work that has become unrealistic or late</li>
          <li>restore missing execution paths in active projects</li>
          <li>repair weak Next items that are not truly ready</li>
          <li>reclassify non-current work into Someday when appropriate</li>
        </ul>
      </Section>

      <Section id="app-quick-guidance" title="Practical guidance">
        <ul>
          <li>Capture fast, but clarify before relying on the item.</li>
          <li>Prefer clear wording over clever wording.</li>
          <li>Do not over-schedule hoped-for work.</li>
          <li>Use projects for outcomes, not for decorative grouping.</li>
          <li>Mark Next only when the item is genuinely startable.</li>
          <li>Use child structure when it clarifies execution, not when it hides it.</li>
          <li>Review often enough that Today remains believable.</li>
          <li>When the system feels noisy, simplify the data before changing the model.</li>
        </ul>
      </Section>

      <Section id="app-troubleshooting" title="When EGS starts to feel wrong">
        <p>Recommendation quality usually degrades for a few predictable reasons:</p>
        <ul>
          <li>Inbox is too full.</li>
          <li>Projects have no actionable path.</li>
          <li>Tasks are phrased too vaguely.</li>
          <li>Scheduled is being used for aspirational work.</li>
          <li>Waiting items are not being reviewed.</li>
          <li>Parent tasks are being treated as execution units even though the real work is lower down.</li>
          <li>Tasks are labelled Next before they are truly ready.</li>
          <li>Metadata has become noisy without improving judgement.</li>
        </ul>
        <p>
          In most cases, the best first recovery move is not to rewrite the scoring model. It is to
          perform a short review pass and repair the task data. Guidance models usually fail first at
          the data layer, not the algorithmic layer.
        </p>
        <Callout title="First recovery move" tone="warning">
          Before changing scoring logic, do a review pass. Many problems come from stale or
          low-quality data rather than from the guidance model itself.
        </Callout>
      </Section>
    </div>
  );
}

export default function HelpPage() {
  const [tab, setTab] = useState<HelpTab>("egs");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const lastUpdated = useMemo(() => new Date().toLocaleDateString("en-AU"), []);
  const inAppShell = location.pathname.startsWith("/app/");

  const egsToc: TocItem[] = [
    { id: "egs-what-it-is", label: "What EGS is" },
    { id: "egs-execution-model", label: "Execution model" },
    { id: "egs-operating-cycle", label: "Operating cycle" },
    { id: "egs-states", label: "Core states" },
    { id: "egs-projects-next-actions", label: "Projects and paths" },
    { id: "egs-readiness-model", label: "Readiness model" },
    { id: "egs-prioritisation", label: "Prioritisation" },
    { id: "egs-scoring-model", label: "Scoring model" },
    { id: "egs-best-next-action", label: "Best Next Action" },
    { id: "egs-guided-actions", label: "Guided Actions" },
    { id: "egs-project-health", label: "Project Health" },
    { id: "egs-review-discipline", label: "Review discipline" },
    { id: "egs-inbox-to-project", label: "Inbox to project" },
    { id: "egs-scoring-examples", label: "Scoring examples" },
    { id: "egs-common-failures", label: "Failure modes" },
    { id: "egs-philosophy", label: "Philosophy of use" },
  ];

  const appToc: TocItem[] = [
    { id: "app-mental-model", label: "Mental model" },
    { id: "app-tasks-page", label: "Tasks page" },
    { id: "app-inbox-processing", label: "Inbox processing" },
    { id: "app-today-page", label: "Today page" },
    { id: "app-execution-signals", label: "Execution signals" },
    { id: "app-project-health", label: "Project Health" },
    { id: "app-metadata", label: "Metadata" },
    { id: "app-review-page", label: "Review" },
    { id: "app-quick-guidance", label: "Practical guidance" },
    { id: "app-troubleshooting", label: "Troubleshooting" },
  ];

  const toc = tab === "egs" ? egsToc : appToc;

  return (
    <div className="help-page">
      {!inAppShell ? (
        <div className="help-utility-bar">
          <Link className="btn btn-secondary" to="/">
            Home
          </Link>
          <div className="help-utility-actions">
            {isAuthenticated ? (
              <button className="btn btn-primary" onClick={() => navigate("/app/today")}>
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
            A detailed explanation of the thinking model behind EGS, how the application is intended
            to be used, and how guidance signals are produced.
          </p>
        </div>
        <div className="help-updated">Last updated: {lastUpdated}</div>
      </div>

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
          <ContentsNav items={toc} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        </aside>
        <main>{tab === "egs" ? <EgsGuideTab /> : <AppGuideTab />}</main>
      </div>
    </div>
  );
}