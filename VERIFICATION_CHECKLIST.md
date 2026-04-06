1. Create a waiting subtask with free-text waiting only; confirm it saves and remains in Waiting.
2. Create a waiting subtask with waitingForTaskId set to another open task in the same project and resumeStateAfterWait = next; confirm save succeeds.
3. Try to wait on self, a descendant, a completed task, or a someday/reference task; confirm API rejects it.
4. Complete the blocker task; confirm dependent waiting task moves to Next or Inbox as configured and structured blocker fields are cleared.
5. Inspect Today / Review / task summary surfaces and confirm P1 is shown as strongest priority and blocked tasks display blocker context.
6. Confirm voice capture still parses P1–P4 and now also recognises P5 / very low priority phrases.
