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
      title: "Readiness",
      body: "Can the task genuinely begin now, or is it waiting, blocked, or tied to a future date?",
    },
    {
      title: "Due pressure",
      body: "Does the task carry real time sensitivity such as overdue status, a near deadline, or a genuine commitment date?",
    },
    {
      title: "Project leverage",
      body: "How strongly does the task advance an active outcome, unblock other work, or restore movement in an important project?",
    },
    {
      title: "Staleness and drift",
      body: "Has the surrounding project gone quiet, lost a next action, or remained in waiting too long without intervention?",
    },
    {
      title: "Effort and duration fit",
      body: "Does the task suit the likely working window? Short gaps favour quick wins; deeper blocks favour larger or more cognitive work.",
    },
    {
      title: "Definition quality",
      body: "Clear, specific, executable tasks are more credible than vague placeholders that still require interpretation.",
    },
  ];

  return (
    <div className="help-flow-shell">
      <div className="help-flow-header">
        <div className="help-flow-title">Guidance model</div>
        <div className="help-flow-subtitle">
          Today does not use a single ranking rule. It combines several signals to reduce ambiguity around the next good move.
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
          due pressure, effort, minimum duration, project health, waiting signals, and definition
          quality to estimate which options are credible now and which parts of the system need
          repair first.
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
          In broad terms, the model first checks whether a task is realistically available. It then
          increases or decreases credibility based on time pressure, project significance, recent
          movement, effort fit, and clarity. This means a task with a distant due date can still rank
          highly if it is the clearest high-leverage move, while a vague task with nominal priority
          may rank poorly because it still needs clarification.
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
          If Best Next Action repeatedly feels wrong, the first diagnosis should usually be data
          quality rather than scoring failure. Common causes include vague tasks, overused scheduled
          dates, stale waiting items, and projects with missing executable paths.
        </p>
      </Section>

      <Section id="egs-guided-actions" title="Guided actions and maintenance signals">
        <p>
          EGS is not only concerned with direct execution. It also protects the quality of the
          system itself. Guided Actions therefore surface maintenance interventions that keep the
          guidance trustworthy.
        </p>
        <p>Typical examples include:</p>
        <ul>
          <li>projects that no longer have a next action</li>
          <li>waiting items that need a follow-up</li>
          <li>scheduled commitments that have drifted or become unrealistic</li>
          <li>stale projects that are still open but no longer moving</li>
          <li>items whose wording is too vague to execute confidently</li>
        </ul>
        <p>
          These recommendations matter because system quality erodes quietly. Guided Actions help the
          user repair the data model before visible overload sets in.
        </p>
      </Section>

      <Section id="egs-review-discipline" title="Review discipline and system trust">
        <p>
          Review is the mechanism that keeps EGS believable. Without review, inbox items linger,
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
        </ul>
        <Callout title="Important principle">
          The system becomes trustworthy when the user can assume that open items mean something
          accurate and current.
        </Callout>
      </Section>

      <Section id="egs-common-failures" title="Common failure modes">
        <p>Recommendation quality usually degrades for a small number of predictable reasons:</p>
        <ul>
          <li>using Inbox as a permanent parking lot</li>
          <li>keeping projects open without a visible next move</li>
          <li>scheduling aspirational work too aggressively</li>
          <li>writing vague tasks that cannot be started in one sitting</li>
          <li>treating waiting as a place to forget rather than a place to follow up from</li>
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
        </ul>
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
            Inbox processing, waiting follow-up, date repair, or project path repair.
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
          ask: does it still have a next move, does it need a follow-up, is the date honest, and is
          the wording specific enough for execution?
        </p>
        <Callout title="Use it diagnostically">
          Project health is most useful when it triggers a repair: add the next action, follow up,
          renegotiate the date, or simplify the project model.
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
          <li>reclassify non-current work into Someday when appropriate</li>
        </ul>
      </Section>

      <Section id="app-quick-guidance" title="Practical guidance">
        <ul>
          <li>Capture fast, but clarify before relying on the item.</li>
          <li>Prefer clear wording over clever wording.</li>
          <li>Do not over-schedule hoped-for work.</li>
          <li>Use projects for outcomes, not for decorative grouping.</li>
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
    { id: "egs-prioritisation", label: "Prioritisation" },
    { id: "egs-scoring-model", label: "Scoring model" },
    { id: "egs-best-next-action", label: "Best Next Action" },
    { id: "egs-guided-actions", label: "Guided Actions" },
    { id: "egs-review-discipline", label: "Review discipline" },
    { id: "egs-common-failures", label: "Failure modes" },
    { id: "egs-philosophy", label: "Philosophy of use" },
  ];

  const appToc: TocItem[] = [
    { id: "app-mental-model", label: "Mental model" },
    { id: "app-tasks-page", label: "Tasks page" },
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
