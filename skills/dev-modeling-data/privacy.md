# Personal data in the model (G3)

Read this when an entity holds data about a person: name, email, phone, address, an identifier that
leads back to one person, location, behaviour, or anything special (health, finance, biometrics,
children). Privacy is a property of the data model, because that is where it becomes impossible to
add later. You cannot delete what you never found, and you cannot find what no column says is personal.

## For every field that is personal, the data model says

| Column in `data-model.md` | Rule |
|---|---|
| **Class** | `pii` · `sensitive` (special category) · `pseudonymous` (an id that maps to a person elsewhere) · `none` |
| **Purpose** | why it is collected, one line. A field with no purpose is not collected |
| **Retention** | how long it is kept, and what happens after: `deleted` · `anonymised` · `aggregated`, with the job that does it. "Forever" needs a reason a lawyer would accept |
| **Source** | the user · a third party · derived. Derived personal data is still personal |
| **Access** | which roles read it. Default: nobody but the owning service |

G3 fails personal data with no retention period.

## Deletion is designed, not hoped for

A person can ask for their data to be deleted, and in many places the law says yes. Design for it:

- Every personal field is reachable from the person's id: through foreign keys, or a documented
  lookup for denormalised and copied data (search indexes, caches, analytics, logs, backups).
- Deletion is one operation that covers every store. Leaving a soft-delete flag set on one table is
  not deletion.
- Backups expire within the retention period, or the restore procedure re-applies deletions.
- Logs and traces never carry personal data in the first place (§13.5). That is cheaper than
  deleting it from them.

## Minimise before you protect

The cheapest personal data to protect is the data you did not keep. Prefer:

- storing a derived value (an age band, a region) over the raw one (a birth date, an address);
- a hash or a token over the value, when only equality matters;
- not copying personal data into a second store "for convenience". Every copy is another deletion to
  remember and another breach to report.

## Consent and lawful basis

Where the product depends on consent (marketing, tracking, optional analytics), the model stores
the consent itself: what was agreed, when, which version of the text, and its withdrawal. Processing
stops when consent is withdrawn. Consent is not the only lawful basis. Whether a feature relies on
consent, a contract or another basis is a product decision. Raise it as a `DEC-NNN` (§15.2); do not
assume one.

## Cross-border and third parties

Name every processor that receives personal data (email provider, analytics, a model API, §13.14)
and the region it stores data in. A new processor is an ADR line and, usually, a `DEC` for whoever
owns the privacy notice.
