# A slow test — the performance investigation before any timeout change

DEV-CONTRACTS §13.7: a slow test is a performance report until shown otherwise. On
release-management, two product bugs — a list that remounted every comment when an older window
loaded, and a component that re-measured its layout on every render — were first seen as unit tests
that timed out under load. The first response was to raise the timeouts. These steps are what to do
instead. They apply at G7 (the implementer) and at G8 (the verifier records, never fixes).

## Steps

1. **Measure, do not guess.** Run the test alone, three times, and note the times. Then run it in
   the suite. Alone-and-fast but slow-in-suite points at shared state or machine load (step 5);
   slow alone points at the product.
2. **Count the work the test causes**, in the tier it is in:
   - **UI**: render and mount counts per row (`dev-writing-react-code/render-checks.md` §1–§2) and
     layout reads (§3). A count that grows with the list's length, or a remount of rows already on
     screen, is the product bug.
   - **API / integration**: the request's query count (`X-Query-Count`, the counter in
     `dev-writing-go-code/query-checks.md` or `dev-writing-python-code/query-checks.md`) at two row
     counts. A count that grows with the rows is N+1.
   - **SQL**: the plan of each query the test runs (`EXPLAIN`, same files §3). A sequential scan of
     a large table is a missing index.
3. **Scale the input.** Run with 2× the rows or items. Time that roughly doubles is linear and may
   be fine; time that quadruples is a loop inside a loop — in the product or in the test.
4. **Read the test's own cost.** A query by role over a whole page, `findBy*` polling a node that
   never appears, a fake timer advanced one tick at a time, a fixture rebuilt per case — test
   defects are real, and scoping the query is the right fix *only after* steps 2–3 found nothing in
   the product.
5. **Only then the environment.** A loaded machine, a parallel suite on one database, a cold
   container. Record the evidence (step 1's alone-vs-suite times).
6. **Record it.** In the lane note's deviations (G7) or the run's `## Failures` (G8): the test, the
   times, what was counted, the cause, and the fix. A timeout raised with no recorded investigation
   is a finding at review — `MAJOR` when a product cause was there to find.

A timeout may be raised when steps 1–5 show the work is necessary and bounded, and the new value is
derived from the measurement (alone × 3), not chosen to make the run green.
