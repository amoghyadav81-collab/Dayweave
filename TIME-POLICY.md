# Time and planning policy

- The saved preference is a validated IANA timezone. Tool dates and `date`/`time` fields are local calendar dates and 24-hour times in that zone, never the server's or browser's timezone. Context defaults resolve “today” in the user's saved zone; the server does not interpret natural-language dates itself.
- Activity duration is **elapsed minutes** (5–1440), calculated with the maintained Temporal polyfill. A 60-minute activity across a fall-back transition can start and end at the same displayed clock time. MCP reads include resolved `startInstant`/`endInstant` when valid.
- A nonexistent local start in a DST gap is rejected (`NONEXISTENT_LOCAL_TIME`), including when an occurrence is supplied. It is never silently shifted.
- A repeated/fold local time requires `occurrence:"earlier"` or `"later"`; missing/null is `AMBIGUOUS_LOCAL_TIME`. The editor exposes the choice. A partial reschedule to a different date/time resets an omitted occurrence so an earlier choice is not silently carried to a new ambiguous time. Select it explicitly for that new schedule.
- Activities intersecting a local day appear on that day, including overnight carry-in, in web daily/weekly views and `get_day_plan`. An activity ending exactly at midnight is excluded from the following day. Overlap and reminders compare real instants; ambiguous legacy records are not guessed and do not fire reminders until corrected.
- Reminder lead minutes subtract elapsed minutes from the resolved start, so they may fall on the previous local date or across a DST change. No alarm is promised when a page cannot execute.
- Existing data that predated this policy is not destructively migrated. MCP reads report `timeIssues` for unresolved starts. The user can edit a problematic time/occurrence in the app. No reminder is silently assigned an occurrence.
- Changing timezone on a nonempty planner reinterprets its existing wall-clock dates/times. **Only the user can explicitly confirm this in the app**, including its effect on fixed/completed activities. All resulting starts are validated before committing; an unresolved DST time blocks the entire timezone change. AI cannot use a preference change or reversal to move protected records indirectly. This is a wall-clock planner policy, not an automatic travel-calendar conversion.

## Small, inspectable context

`get_planning_context` defaults to today plus six days, returns at most 100 activities (maximum requested page 200) and provides `nextOffset`. A client must read subsequent pages before claiming a complete plan. The optional date/days parameters are bounded to at most 14 days per request. The brief remains capped at 6,000 characters; do not copy entire conversations into it.

Activities distinguish `confirmed_routine`, `commitment`, `deadline` and `intention`. A fixed activity is an explicit commitment/routine, not an inference from a tentative idea. The fictional demonstration labels its records and leaves unscheduled time. No unfinished activity is automatically copied to tomorrow; Copy to tomorrow is an explicit user action and excludes prior-day carry-in records.
