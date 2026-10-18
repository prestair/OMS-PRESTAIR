# Orders Dashboard filter changes: top Done button, (With Image) option, Deleted-On date fix

Three independent filter improvements land in a single commit (`e3260c6`) touching only `src/pages/Dashboard.jsx` (78 insertions, 4 deletions). A compact green **Done** button is added to the top-left of all three filter-dropdown headers (Active column filter, Completed value filter, Completed Deleted-On date filter). A **(With Image)** checkbox option is added to the paymentRemarks and remarks column filters in both tabs, filtering by the presence of a proof image. And the Completed tab's **Deleted On** date-range filter is rewritten from timezone-fragile `new Date()` comparisons to integer calendar-day keys, fixing the reported bug where a 3.9.26 order leaked into a 3.10.26 filter. The change implements the approved plan verbatim at every call site.

Watch for: nothing blocking. The one thing worth knowing (confirmed) is a documented limitation inherited from the plan — an order deleted *before* its proof image was uploaded has no `paymentProofUrl`/`auditProofUrl` in its snapshot, so `(With Image)` cannot match it on the Completed tab. This is expected, not a defect.

**Verdict**: APPROVED

## High-level view

The three dropdown Done buttons each call the correct open-state setter for their tab — `setOpenFilterWithRef(null)` for Active, `setDeletedOpenFilter(null)` for both Completed dropdowns — and sit as the first child of the existing header, leaving the Clear link, the bottom Done/Apply button, and the `stopPropagation`/click-outside behavior untouched.

The `(With Image)` option is wired at all five required sites: three evaluation blocks (Active `columnFilters` useEffect, Completed `handleDeletedExport`, Completed inline render) and two render blocks (Active via `toggleFilterValue`, Completed via the inline `setDeletedColumnFilters` toggle its siblings use). Each evaluation branch is an OR check placed after `(Blank)`/`(Non Blank)` and before the final value match, so it combines with other selected values exactly like the existing special options. The render option is gated to only the paymentRemarks and remarks columns in both tabs.

The Deleted-On fix introduces one shared `deletedDateKey` helper that returns an integer `y*10000+m*100+d`. It parses `YYYY-MM-DD` input strings by direct string split (no `new Date`, which is what avoids the UTC-midnight shift) and parses full timestamps with `new Date` using local parts. Both comparison sites — inline render and export — were replaced; no `new Date(deletedDate…)` comparison remains anywhere. The worked example holds: with From=To=2026-10-03, a 2026-09-03 order is excluded and a 2026-10-03 order (any local time) is included.

<details>
<summary>Issues (1)</summary>

1. **(With Image) can't match pre-upload deletions** — on the Completed tab, orders deleted before a proof image was uploaded lack the proof field in their snapshot, so `(With Image)` won't surface them. Documented and expected per the plan; no action required, noted for reviewer awareness. (confirmed)

</details>

<details>
<summary>Details</summary>

### Top-left Done button across all three dropdowns

Each dropdown header gains a green `filterDoneTopBtn` as its first child, left of the `Filter: {label}` span, with the red Clear link unchanged on the right. The Active dropdown's button closes via `setOpenFilterWithRef(null)` (the setter that also updates `openFilterRef` used by click-outside), and both Completed dropdowns close via `setDeletedOpenFilter(null)`. The Deleted-On dropdown's existing bottom button (labeled Apply, also calling `setDeletedOpenFilter(null)`) and the two value dropdowns' bottom Done buttons are left in place, so nothing about the existing close paths changes. The buttons are nested inside the dropdown's `onClick={e => e.stopPropagation()}` container, so they don't trip the click-outside handler. A single shared style keeps the three headers visually consistent. (confirmed — three usages at the three header landmarks, one style definition)

### (With Image) option and its OR semantics

The option matches orders whose proof URL is non-empty: `paymentProofUrl` for the paymentRemarks column, `auditProofUrl` for remarks. On active orders these fields are top-level from `mapOrder`; on deleted orders the same fields live top-level in the delete-time snapshot, so both tabs read them identically. The evaluation branch:

```js
if (selectedValues.includes('(With Image)')) {
  if (key === 'paymentRemarks' && o.paymentProofUrl) return true
  if (key === 'remarks' && o.auditProofUrl) return true
}
return selectedValues.includes(val)   // (or includes(raw) on the Completed side)
```

sits after the `(Blank)`/`(Non Blank)` checks and before the real-value match, so selecting `(With Image)` together with real values OR-passes any match — identical to how the existing special options behave. Because `(With Image)` is never a real cell value, the fall-through `includes(val)` can't match it spuriously: if it's the only selection and the order has no image, the branch doesn't return and the final check is false. All three evaluation sites (Active useEffect, export builder, inline render) carry the identical branch; the two render blocks are gated with `col.key === 'paymentRemarks' || col.key === 'remarks'` so the option never appears on other columns or on the Deleted-On date dropdown. The Active render uses `toggleFilterValue`; the Completed render mirrors its siblings' inline `setDeletedColumnFilters` updater (including the delete-the-key-when-empty cleanup), which is the correct choice since `toggleFilterValue` targets `columnFilters`, not `deletedColumnFilters`. (confirmed)

The one caveat, inherited and documented in the plan: a Completed order deleted before its proof image existed won't have the field in its snapshot and so can't be matched by `(With Image)`. The truthy check already excludes it, which is the intended behavior. (confirmed)

### Deleted-On date fix via integer day keys

```js
const deletedDateKey = (dateLike) => {
  if (!dateLike) return null
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateLike)) {
    const [y, m, d] = dateLike.split('-')
    return parseInt(y, 10) * 10000 + parseInt(m, 10) * 100 + parseInt(d, 10)
  }
  const dt = new Date(dateLike)
  if (isNaN(dt.getTime())) return null
  return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate()
}
```

The `YYYY-MM-DD` input path splits the string directly and never constructs a `Date`, which is what sidesteps the old `new Date('2026-10-03')`-is-UTC-midnight bug. The timestamp path uses local getters, matching how the order's `deletedAt` is displayed to the user. Both comparison sites were replaced with the same `fromKey`/`toKey`/`dayKey` guard using inclusive `<`/`>` boundaries, and a grep confirms no `new Date(deletedDate…)` comparison survives anywhere; the remaining `deletedDateFrom`/`deletedDateTo` references are only state, the summary chip, the `isActive` flag, the Clear buttons, and the two date inputs. Worked example (From=To=2026-10-03 → key 20261003): a 2026-09-03 deletion → 20260903 < from → excluded; a 2026-10-03 deletion at any local time → 20261003 → included; a 2026-10-04 deletion → 20261004 > to → excluded. This fixes the reported leak of 3.9.26 orders into a 3.10.26 filter. (confirmed)

One structural note, verified non-blocking: `handleDeletedExport` is defined (line 672) before `deletedDateKey` (line 1675), both inside the `Dashboard()` component body. Because `handleDeletedExport` is a `const` arrow function invoked only on the export button click — long after the component body has finished running and the helper is initialized — the closure resolves `deletedDateKey` correctly at call time. There is no temporal-dead-zone hazard. (confirmed)

### Scope and build evidence

The commit touches only `src/pages/Dashboard.jsx`; the sole style addition is the `filterDoneTopBtn` entry in the `styles` object. No backend, AuthContext, egress, or Follow-Up code is involved. The plan required a passing `npm run build` before committing, and the matching commit `e3260c6` with the expected message exists at HEAD (one ahead of `origin/main`, not pushed). Per the review constraints the build was not re-run and the diff showed no specific articulable doubt warranting it; the regions inspected are syntactically balanced valid JSX. Existing behaviors — search, color filter, `(Blank)`/`(Non Blank)`, Clear, Clear All, summary chips, bottom Done/Apply, and click-outside-to-close — are all preserved. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/pages/Dashboard.jsx` — all three features: top-left Done buttons on the three filter dropdowns, `(With Image)` option + evaluation at five sites, `deletedDateKey` helper and the two Deleted-On comparison rewrites, plus the `filterDoneTopBtn` style.

Full diff: `git diff origin/main -- src/pages/Dashboard.jsx` (commit `e3260c6`).

</details>
