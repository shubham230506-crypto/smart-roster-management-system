# Smart Roster Management System --- DataStraw Tech Assessment

A constraint-aware, full-stack monthly roster generation and validation
engine built for multi-brand, multi-process D2C customer experience
operations.

## Tech Stack

-   **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS,
    Lucide Icons
-   **Backend & Scheduling Engine:** Next.js API Routes and a
    deterministic constraint solver (`src/lib/scheduler.ts`)
-   **Database:** Prisma ORM with SQLite (`prisma/schema.prisma`)

------------------------------------------------------------------------

## Local Setup Instructions

### Prerequisites

-   Node.js and npm
-   Git

### 1. Clone the repository

``` bash
git clone <your-github-repo-url>
cd smart-roster-system
```

### 2. Install dependencies

``` bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

``` bash
cp .env.example .env
```

On Windows PowerShell, use:

``` powershell
Copy-Item .env.example .env
```

Update `.env` if the project requires any local configuration.

### 4. Initialize and seed the database

Apply the Prisma schema and populate the database with the sample data
(32 employees, 4 pods, and 15 brands):

``` bash
npx prisma db push
npx prisma db seed
```

### 5. Run the development server

``` bash
npm run dev
```

Open <http://localhost:3000> in your browser.

------------------------------------------------------------------------

## Architecture & Engineering Reasoning (Section 8)

### 1. How did you model employees, brands, processes, pods, and their relationships?

I modeled the domain using a normalized relational schema
(`prisma/schema.prisma`) that separates organizational structure, client
operating rules, and employee availability.

-   **Pods and employees:** A `Pod` groups `Employee` records. The
    sample setup contains four pods, each with one Pod Lead and seven
    agents, for a total of 32 employees. Each employee stores individual
    constraints such as `preferredWeeklyOff` and `isActive`.
-   **Brands and processes:** `Brand` and `Process` (CS, ACC, NDR, RET)
    are separate entities connected through `BrandProcess`. This
    relationship defines client-specific operating calendars
    (`ALL_365_DAYS`, `ALL_DAYS_EXCEPT_HOLIDAYS`, and
    `NO_SUNDAYS_NO_HOLIDAYS`) and `minDailyStaff` for each process.
-   **Resource allocations:** The `ResourceAllocation` junction table
    maps `employeeId`, `brandId`, and `processId`, with attributes such
    as `isPrimary` and `allocationPct`. This supports single-resource
    brands (one employee mapped to all processes of a brand),
    multi-employee brands (separate or overlapping process assignments),
    and cross-brand floaters without duplicating the schema.

### 2. How does your system generate a roster and determine whether it satisfies the required constraints?

Roster generation (`generateMonthlyRoster` in `src/lib/scheduler.ts`)
runs in deterministic stages:

1.  **Calendar expansion:** Generates UTC dates for the target month and
    loads public holidays plus approved `EmployeeLeave` and `COMP_OFF`
    records.
2.  **Schedule resolution:** Evaluates each employee day by day against
    hard unavailability (leave and comp-offs), brand holiday rules, and
    weekly-off alignment. Weekly offs are automatically aligned to
    Sundays when all assigned brands are closed on Sundays.
3.  **Constraint validation:** `validateRoster` audits every
    `(Brand, Process, Date)` combination against its operating rule and
    `minDailyStaff`.

Violations are classified as:

-   **CRITICAL:** Hard coverage failures, such as `ZERO_BRAND_COVERAGE`
    or `UNDERSTAFFED_PROCESS`.
-   **WARNING:** Soft preference overrides, such as
    `PREFERENCE_OVERRIDDEN`.

### 3. How did you handle the difference between single-resource brands and brands with multiple employees?

-   **Single-resource brands (approximately 80% of the portfolio):**
    When `uniqueAssignedEmployees === 1` and the brand requires coverage
    on the employee's preferred weekly-off day, the scheduler
    prioritizes mandatory client coverage (a hard constraint) over the
    employee's weekly-off preference (a soft constraint). It logs a
    `WARNING` so the manager can arrange a weekday comp-off.
-   **Multi-resource brands (approximately 20% of the portfolio):**
    Staggered weekly-off preferences across the two or three assigned
    employees allow individual teammates to take weekly offs or approved
    comp-offs without creating coverage gaps. For example, Veloce
    Athletics has three CS staff for a `minDailyStaff` requirement of
    two.

### 4. What happens when an employee manages all processes for a brand but is unavailable on a required working day?

When a dedicated single-resource owner has an approved `PLANNED_LEAVE`
or `COMP_OFF`, or is manually marked unavailable in the UI, the system
does not silently drop the shift.

-   All processes owned by that employee for the affected brand are
    flagged with `CRITICAL ZERO_BRAND_COVERAGE` alerts.
-   The validation engine scans the same operational pod for an idle or
    spare-capacity employee qualified in the affected process (CS, ACC,
    NDR, or RET).
-   A concrete backup recommendation is surfaced in the conflict panel
    for the manager to review.

### 5. How does your system handle conflicting requirements or insufficient staffing?

The engine enforces a clear **hard-versus-soft constraint hierarchy**.

-   **Soft-versus-hard conflict:** Client SLA coverage takes priority
    over an employee's preferred weekly-off day. The system records the
    override with an explicit `WARNING`.
-   **Unresolvable hard conflict (insufficient staffing):** If approved
    leave or headcount shortages cause `activeWorkingStaff` to fall
    below `minDailyStaff`, the system still generates the roster
    transparently. It highlights affected cells with a red border and
    lists each gap in the **Critical Coverage Gaps** drawer for the
    Operations Manager to resolve.

### 6. Which parts of the process did you automate, and which did you leave under human control? Why?

**Automated**

-   Monthly calendar expansion
-   Holiday and Sunday operating-rule matching
-   Prevention and detection of single-owner weekly-off conflicts
-   Live coverage validation after roster edits
-   Same-pod backup-candidate matching

These tasks are deterministic and error-prone when performed manually at
scale, so automation improves consistency and reduces operational
effort.

**Kept under human control**

-   Final leave approvals
-   Decisions to override coverage in order to grant comp-offs
-   Cross-pod reassignments
-   Final roster review and publishing

These decisions involve operational trade-offs and business context. For
example, deciding whether to pull a floater from another brand or ask a
Pod Lead to cover should remain subject to manager approval.

### 7. If the company doubled its team and brand count, what would you change about your solution?

I would focus on database scalability, scheduling optimization, and
access control.

-   **Database and concurrency:** Migrate from SQLite to managed
    PostgreSQL, add composite indexes such as
    `(rosterId, date, brandId)`, and use transactional batching for
    roster operations.
-   **Optimization solver:** Move beyond a greedy, rule-based scheduler
    to a constraint-satisfaction or integer linear programming (ILP)
    solver, such as Google OR-Tools. This would help optimize fair
    weekend and holiday rotation across 60+ employees and 30+ brands.
-   **UI virtualization and role-based access:** Virtualize roster-grid
    rows and columns to maintain smooth scrolling, and introduce Pod
    Lead versus Operations Manager permissions so Pod Leads can edit
    only their own pods.

### 8. If you had one additional week to work on this, what would you improve first?

I would prioritize improvements that reduce manual conflict resolution
and strengthen operational safeguards.

1.  **One-click "Apply Backup" action:** Turn each backup suggestion in
    the conflict panel into an action that creates a temporary
    cross-brand coverage entry and revalidates the affected roster.
2.  **Rolling seven-day labor-compliance guardrail:** Add automatic
    alerts when overriding a weekly off would cause an employee to work
    more than six consecutive days without a compensatory off.
3.  **Shift-window granularity:** Add morning and evening shift slots
    for brands that require 16--24-hour coverage windows.

------------------------------------------------------------------------

## Project Notes

-   The scheduling engine is deterministic: the same inputs and
    constraints produce the same roster output.
-   Critical coverage gaps are surfaced rather than silently hidden.
-   Recommendations are presented for human review; operationally
    significant decisions remain with the manager.
