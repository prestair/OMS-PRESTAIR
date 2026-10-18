# Shared filter+sort helper to sync OR Issue Report Excel/Print with the on-screen table

This change makes the OR Issue Report (`dailyFilter === 'orRecvd'`) produce an identical row set and row order across the three places it is rendered: the on-screen table, the Excel export (`handleDailyExport`), and the Print output (`handleDailyPrint`). Previously the export and print branches carried their own inline copies of the status/filter/sort logic, and those copies used a sort comparator with no alphabetical tie-breaker for the `ISSUED TO` group — so once two orders landed in that group their relative order diverged from what the screen showed. The fix extracts two component-scope helpers, `getOrRequestStatus()` and `getOrFilteredSortedOrders()`, and calls them from all three sites. On-screen remains the source of truth; its logic was lifted verbatim into the shared helper.

Watch for: nothing blocking. The shared helper is byte-for-byte the on-screen logic, the pre-existing status/filter behavior is preserved, and the `aOrder === 2` localeCompare tie-breaker now applies uniformly (confirmed). Build evidence is recorded in the commit message (vite v5.4.21, exit 0, 2.65s, zero errors).

**Verdict**: APPROVED

## High-level view

The three render paths previously duplicated the OR status/filter/sort logic. The on-screen path was the only one with the alphabetical tie-breaker for the `ISSUED TO` group; export and print used a shorter comparator (`getOrd(a) - getOrd(b)`) that stopped at the group-rank level, leaving same-rank orders in base-list order. That is the exact drift the user reported. The fix removes both inline copies and routes all three through `getOrFilteredSortedOrders()`, which contains the on-screen comparator including the `aOrder === 2` localeCompare branch.

The shared `getOrRequestStatus()` is the on-screen status function, including `requesterLabel()` which appends the `(admin)` marker for admin-placed requests, so the `ISSUED TO <name> (admin)` label (and therefore the alphabetical key used in the tie-breaker) is identical everywhere. Both helpers live in Dashboard component scope and close over the same state (`paperRequests`, `returnRequests`, `orTabSearch`, `orTabUserSearch`, `orTabStatusFilter`) and the same base list `getIssueReturnOrders()`, so there is no remaining way for the three paths to disagree.

Column content and headers are untouched — only the ordering and membership of rows changed, both of which now derive from the single helper. No other `dailyFilter` branch and no unrelated subsystem (behalf-of, payments, egress, login) was modified.

<details>
<summary>Issues (0)</summary>

No blocking or actionable concerns. The change is a clean de-duplication that resolves the reported export/print ordering drift.

</details>

<details>
<summary>Details</summary>

## The drift this fixes, and why the helper closes it

The on-screen comparator ended with a two-tier decision: first compare the group rank, and when both rows fall in the `ISSUED TO` group (`aOrder === 2`) break the tie with `getRequestStatus(a).localeCompare(getRequestStatus(b))`. The export and print comparators were a single tier — `return getOrd(a.orderNo) - getOrd(b.orderNo)` — so any two `ISSUED TO` rows compared equal and retained their incoming base-list order instead of being sorted by the issued-to label. With more than one accepted issue in the report, screen and Excel/print would list the same orders in a different sequence. Both inline comparators are deleted and replaced by the single `getOrFilteredSortedOrders()` call, which carries the full two-tier comparator, so the `ISSUED TO` block is now alphabetized identically in all three outputs (confirmed by reading the removed `getOrd` blocks against the retained on-screen `getOrder`).

A second, smaller divergence is also closed: the old export/print `getOrd` returned rank `5` only for `v === '-'`, while the on-screen `getOrder` returned `5` for `v === '-' || v === ''`. The shared helper uses the on-screen form, so an empty status string now ranks as `NO REQUEST` (last) consistently rather than falling through to the `return 2` default in the export/print copies (confirmed).

## Worked example: identical ordering across all three

Take seven orders whose statuses resolve to ISSUE, PENDING, ISSUED TO "Anil", ISSUED TO "Bela", RECEIVED, REJECTED, and NO REQUEST (`-`). The shared comparator ranks them ISSUE=0, PENDING=1, ISSUED TO=2, RECEIVED=3, REJECTED=4, NO REQUEST=5. Within rank 2 the localeCompare tie-breaker orders "Anil" before "Bela". Final order: ISSUE, PENDING, ISSUED TO Anil, ISSUED TO Bela, RECEIVED, REJECTED, NO REQUEST. Because the screen, Excel, and print all invoke the same `getOrFilteredSortedOrders()` over the same `getIssueReturnOrders()` base list with the same `orTab*` filter state, this sequence is produced identically in every output — which is the behavior the user asked for.

## Status label and the (admin) marker

`getOrRequestStatus()` is the on-screen status function moved verbatim, so the `ISSUED TO ${requesterLabel(latestIssue)}` branch still routes through `requesterLabel`, which appends `' (admin)'` for admin-placed requests. This matters here because the tie-breaker sorts on the full status string: the label used to order the `ISSUED TO` group is the same `(admin)`-bearing string in all three paths, so no path can order the group differently (confirmed via the definition at line 225 and its single call site inside the shared helper).

## Scope and column integrity

The export `exportData.map` and the print `orFiltered.forEach` row builders are unchanged except for renaming the local status call from `getRequestStatus(...)` to `getOrRequestStatus(...)`; every column key, header, and cell expression is identical to before (confirmed in the diff — the `#/Date/Order No/Client/Issue Date/Requested By/Issued By/Status/Collected By/Return Date` shape is preserved). The on-screen `tbody` keeps its own cell markup and only swaps the local status/filter construction for the shared helper via `const getRequestStatus = getOrRequestStatus`. No other `dailyFilter` branch appears in the diff, and nothing touches behalf-of, payments, egress, or login.

## Build evidence

Not re-run per instructions. The commit message records `npm run build` with vite v5.4.21, exit 0, built in 2.65s, zero errors. The evidence is present and internally consistent with a pure refactor of this size (net −32 lines, logic relocated rather than rewritten), so it is accepted as-is.

</details>

<details>
<summary>File map</summary>

- `src/pages/Dashboard.jsx` — added component-scope `getOrRequestStatus()` and `getOrFilteredSortedOrders()`; replaced the inline status/filter/sort copies in the Excel export, Print, and on-screen OR branches with calls to those helpers. +76 / −108.

Full diff: `git show HEAD` on `main` (commit a61d566).

</details>
