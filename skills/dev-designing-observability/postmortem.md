# Postmortem — when something went wrong in production (G11)

Read this when `post-release.md` records an incident: users were hurt, an SLO's error budget burned,
data was wrong, or a rollback ran. A postmortem turns one bad day into a change that makes the next
one less likely. Without one, the same incident comes back with a new ticket number.

## Blameless, and why that is not softness

The question is "what about the system let a reasonable person do this?", never "who did it?". People
who are blamed hide what happened, and a postmortem built on hidden facts fixes the wrong thing.
Name roles and systems, not people, in what is written.

## The record

Write it under `post-release.md` `## Incidents and anomalies`. Give it its own file
(`monitoring/<slug>/postmortem-<YYYY-MM-DD>.md`) when it does not fit in a few paragraphs.

| Section | Content |
|---|---|
| Summary | two sentences: what users saw, for how long |
| Impact | users affected, duration, data affected, money or SLO budget consumed, in numbers |
| Timeline | UTC, from the first signal to the all-clear: detection, each decision, each action. Mark when a human first knew |
| Detection | how it was noticed: an alert (which), a user, by chance. Time to detect is a finding of its own |
| Root causes | the chain, not one cause. Ask "why" until you reach something the team can change. "Human error" is never a root cause; it is where the analysis stopped |
| What went well | what limited the damage, so nobody "fixes" it away |
| Actions | each one changes the system, with an owner and a date (§G11 follow-ups). "Be more careful" is not an action |

## Feed it back

Every postmortem ends in at least one of:

- a `## Escaped` row naming the gate that should have caught it (§22). `gate-effect.mjs` counts it;
- a `## Next` row of kind `check` for `/sdlc-improve` (§17), when a review question would have caught it;
- a `## Next` row of kind `lesson` for `/sdlc-learn` (§19), when it is a habit for next time;
- an alert or a runbook change, when detection or response was the weak link.

G11 fails an incident with no postmortem, and a postmortem whose actions all say "be careful".

## Severity guide

| Level | Means | Postmortem |
|---|---|---|
| SEV1 | outage or data loss for many users, or a security breach | required, within 5 working days |
| SEV2 | a major feature broken or an SLO's monthly budget gone | required |
| SEV3 | degraded, a workaround exists | a short one, or a `## Next` row |

The profile may set its own scale; this is the default.
