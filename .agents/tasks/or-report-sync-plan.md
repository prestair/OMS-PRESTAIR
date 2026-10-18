# Implementation Plan — OR Issue Report: sync Excel & Print row order/filtering to on-screen

## Goal

In `src/pages/Dashboard.jsx`, make the **Excel export** and **Print** output of the OR Issue Report
(`dailyFilter === 'orRecvd'`) show rows in the EXACT SAME order and with the EXACT SAME filtering as
the ON-SCREEN table. On-screen is the source of truth and must not change. Only export and print change.

Verification for the whole task: `npm run build` (Vite build; no test framework) from
`d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. Commit on `main`, do not push.

## Findings (the three blocks compared)

All three OR branches start from the same base list: `getIssueReturnOrders()` (defined ~line 241, ends ~line 256). Confirmed.

Three independent copies exist:
1. **On-screen** — inside the `dailyFilter === 'orRecvd'` render IIFE, `getRequestStatus` ~line 2716,
   filter chain ~2732-2757, sort ~2759-2778. This sort has the authoritative tie-breaker.
2. **Export** — `handleDailyExport`, `if (dailyFilter === 'orRecvd')` at ~line 1221; `getRequestStatus`
   ~1222, filter chain ~1239-1241, sort ~1242.
3. **Print** — `handleDailyPrint`, `if (dailyFilter === 'orRecvd')` at ~line 1435; `getRequestStatus`
   ~1436, filter chain ~1454-1455, sort ~1456.

Differences found between on-screen and export/print:

- **getRequestStatus**: byte-identical across all three (same logic, all use `requesterLabel(latestIssue)`
  for the "ISSUED TO" status, so the "(admin)" marker is already present everywhere). No functional diff.
- **orTabSearch filter**: identical across all three.
- **orTabStatusFilter filter**: identical across all three.
- **orTabUserSearch filter**: on-screen reads `getFullName(pr.requestedBy || pr.requested_by)` and
  `getFullName(pr.issueTo || pr.issue_to)`; export/print read the operands in the OPPOSITE order
  (`pr.requested_by || pr.requestedBy`, `pr.issue_to || pr.issueTo`). Behaviorally equivalent in normal data
  (only one naming style is populated per record), but align to on-screen to be exact.
- **Sort — the confirmed bug**: all three use the SAME `getOrder/getOrd` group mapping
  (`-`=5, ISSUE=0, PENDING/RETURN PENDING=1, ISSUED TO=2, REROUTED=1, RECEIVED=3, REJECTED=4, default=2).
  But on-screen adds a tie-breaker — `if (aOrder !== bOrder) return aOrder - bOrder; if (aOrder === 2)
  return getRequestStatus(a.orderNo).localeCompare(getRequestStatus(b.orderNo)); return 0` — while export
  and print do only `return getOrd(a.orderNo) - getOrd(b.orderNo)` with NO alphabetical tie-breaker for the
  "ISSUED TO" group. This is why export/print row order diverges from screen whenever two rows share the
  "ISSUED TO" group.

## Design decision — one shared helper (strongly preferred approach)

Eliminate the three copies by extracting two component-scope helpers, defined ONCE immediately after
`getIssueReturnOrders` (after its closing `}` at ~line 256). Placement there guarantees they close over the
same values all three sites already use: `paperRequests`, `returnRequests`, `requesterLabel`, `getFullName`,
`getIssueReturnOrders`, and the state `orTabSearch`, `orTabUserSearch`, `orTabStatusFilter`.

Signatures:

- `const getOrRequestStatus = (orderNo) => { ... }` — exact copy of the current on-screen `getRequestStatus`
  body (uses `requesterLabel(latestIssue)` for "ISSUED TO").
- `const getOrFilteredSortedOrders = () => { ... }` — starts from `getIssueReturnOrders()`, applies the three
  filters exactly as on-screen (using `getOrRequestStatus` and the on-screen `||` operand order for the user
  search), then sorts with the on-screen comparator INCLUDING the `aOrder === 2` localeCompare tie-breaker.
  Returns the filtered+sorted array.

Rationale: a single implementation makes byte-for-byte identical ordering structurally guaranteed rather than
maintained by hand in three places; it also removes the operand-order drift in the user-search filter.

Reference comparator (authoritative, from on-screen) to use inside `getOrFilteredSortedOrders`:

```js
.sort((a, b) => {
  const getOrder = (orderNo) => {
    const v = getOrRequestStatus(orderNo).toUpperCase()
    if (v === '-' || v === '') return 5
    if (v === 'ISSUE') return 0
    if (v === 'PENDING' || v === 'RETURN PENDING') return 1
    if (v.startsWith('ISSUED TO')) return 2
    if (v.startsWith('REROUTED')) return 1
    if (v === 'RECEIVED') return 3
    if (v === 'REJECTED') return 4
    return 2
  }
  const aOrder = getOrder(a.orderNo)
  const bOrder = getOrder(b.orderNo)
  if (aOrder !== bOrder) return aOrder - bOrder
  if (aOrder === 2) return getOrRequestStatus(a.orderNo).localeCompare(getOrRequestStatus(b.orderNo))
  return 0
})
```

Note: `Array.prototype.sort` mutates in place. `getIssueReturnOrders()` returns a fresh array each call
(it builds a new `combined` array), so sorting it is safe and does not affect other callers.

## Steps

- [ ] 1. Add the two shared helpers in component scope, immediately after the `getIssueReturnOrders`
      function (after its closing `}`, ~line 256) in `src/pages/Dashboard.jsx`.
      `getOrRequestStatus(orderNo)` = exact copy of the on-screen `getRequestStatus` body.
      `getOrFilteredSortedOrders()` = `getIssueReturnOrders()` -> three filters (orTabSearch, orTabUserSearch
      using on-screen `||` operand order, orTabStatusFilter) -> sort with the authoritative comparator above
      (including the `aOrder === 2` localeCompare tie-breaker). Both reference `getOrRequestStatus`.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds (no syntax/reference errors). The helpers are defined but not yet used
      by the three sites.

- [ ] 2. Rewrite the EXPORT branch to use the shared helpers. In `handleDailyExport`, inside
      `if (dailyFilter === 'orRecvd') { ... }` (~line 1221): delete the local `getRequestStatus` (~1222-1238),
      the local filter chain (~1239-1241), and the local sort (~1242). Replace with
      `const orFiltered = getOrFilteredSortedOrders()`. In the `exportData.map` and anywhere else in this
      branch that calls `getRequestStatus(...)`, change the call to `getOrRequestStatus(...)`. Do NOT change
      the columns/headers (`#`, `Date`, `Order No`, `Client`, `Issue Date`, `Requested By`, `Issued By`,
      `Status`, `Collected By`, `Return Date`) or any Excel/HTML preview code — only the source list and the
      status helper name change.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds. Grep the branch to confirm no remaining local `getRequestStatus`
      definition or local sort in the export `orRecvd` block.

- [ ] 3. Rewrite the PRINT branch to use the shared helpers. In `handleDailyPrint`, inside
      `if (dailyFilter === 'orRecvd') { ... }` (~line 1435): delete the local `getRequestStatus` (~1436-1452),
      the local filter chain (~1454-1455), and the local sort (~1456). Replace with
      `const orFiltered = getOrFilteredSortedOrders()`. In the `orFiltered.forEach` row builder and the
      records-count line, change any `getRequestStatus(...)` call to `getOrRequestStatus(...)`. Do NOT change
      the printed columns, the `<th>` header row, the CSS, or `requesterLabel(pr)` usage in the row — only the
      source list and status helper name change.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds. Grep the branch to confirm no remaining local `getRequestStatus`
      definition or local sort in the print `orRecvd` block.

- [ ] 4. Confirm the on-screen block is unchanged and optionally dedupe it to the shared helper.
      REQUIRED: the on-screen render (`dailyFilter === 'orRecvd'`, ~line 2712+) must keep producing the exact
      same output. Minimal/safe: leave the on-screen block as-is (its local `getRequestStatus` and sort are the
      reference and already correct). OPTIONAL cleanup (only if it does not alter behavior): replace the
      on-screen local `getRequestStatus` with `getOrRequestStatus` and the local filter+sort with
      `const filtered = getOrFilteredSortedOrders()`, keeping the per-row `statusColor`/JSX exactly as now.
      If any doubt, prefer leaving on-screen untouched — on-screen must not change.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 5. Final verification and commit. Run `npm run build` from `oms-dashboard` and confirm a clean build.
      Manually re-read all three `orRecvd` branches to confirm: (a) export and print both call
      `getOrFilteredSortedOrders()` as their row source, (b) all three now resolve status via a helper whose
      "ISSUED TO" string is `ISSUED TO ${requesterLabel(latestIssue)}` (so the "(admin)" marker and the
      alphabetical tie-breaker key match), (c) export/print columns and headers are unchanged, (d) no other
      `dailyFilter` branch or unrelated feature was touched. Then commit on `main` (do not push).
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` passes; `git status`/`git diff` shows only `src/pages/Dashboard.jsx` changed
      (plus this plan file under `.agents/tasks/`).

## Constraints / notes

- On-screen behavior is the reference and must not change.
- Do not touch other `dailyFilter` branches (photography, siteVerification, percentReceived, etc.) or
  unrelated features (behalf-of, payments, egress, login).
- Keep the "(admin)" `requesterLabel` marker working in all three outputs — it is already used by all three
  `getRequestStatus` copies and is preserved by routing status through the shared `getOrRequestStatus`.
- Only row ORDER and row SET (filtering) of export/print change to match the screen; column content stays.
- All work on `main` directly in this workspace; no worktree. Commit without pushing.
