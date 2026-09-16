# Pending modules

Nothing is pending. Task Management and Checklist Management were built from
`design/NN Infra Admin.dc.html`:

- **Tasks** — `src/app/(app)/tasks`, model `Task`, flow in `src/lib/tasks/flow.ts`.
  Open → In Progress → Submitted → Approved, and Approved → Reopened.
- **Checklists** — `src/app/(app)/checklists`, models `ChecklistCategory`,
  `Checklist`, `ChecklistCheckpoint` and `ChecklistRun`. The library is
  categories → checklists → checkpoints; inspections are recorded as runs.
