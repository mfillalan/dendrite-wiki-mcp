# Maintenance Inbox

The interactive maintenance surface lives at **[Review Board](/review-board)**. It shows the same findings this page used to dump as text, plus per-item previews, action buttons, and verb-grouped triage (Promote / Reconcile / Quiet).

## Right Now
- 0 active proposals
- 6 active lint findings
- 80 active memory review findings
- 0 active observation clusters

**[→ Open the Review Board](/review-board)** to act on these. The structured snapshot powering both surfaces lives at `docs/public/maintenance-inbox.json`; CLI consumers can run `npx dendrite-wiki wiki:action -- "<action-id>"` against any item id from that file.
