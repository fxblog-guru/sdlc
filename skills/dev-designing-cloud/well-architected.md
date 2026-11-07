# Well-architected — scoring the design

Read with `SKILL.md` step 5. Use the **chosen provider's** framework for the headings; the questions
below are the ones that change designs, mapped onto every framework's pillars.

| Provider | Framework | Pillars |
|---|---|---|
| AWS | Well-Architected Framework — <https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html> | operational excellence · security · reliability · performance efficiency · cost optimization · sustainability |
| Azure | Well-Architected Framework — <https://learn.microsoft.com/azure/well-architected/> | reliability · security · cost optimization · operational excellence · performance efficiency |
| Google Cloud | Well-Architected Framework — <https://cloud.google.com/architecture/framework> | operational excellence · security · reliability · cost optimization · performance optimization · sustainability |
| OCI | Well-Architected Framework — <https://docs.oracle.com/en/solutions/oci-best-practices/index.html> | security and compliance · reliability and resilience · performance and cost optimization · operational efficiency · distributed cloud |
| Alibaba | Well-Architected Framework — <https://www.alibabacloud.com/help/en/well-architected/latest/learning> | security · reliability · cost optimization · operational excellence · performance efficiency |

AWS lenses worth applying when they fit: Serverless, Containers, SaaS, Generative AI, Financial
Services. Azure has workload guides (mission-critical, AI, SaaS); Google has cross-pillar AI/ML and
FSI perspectives.

## Write one decision and one residual risk per pillar

Not "we follow security best practices". This shape:

> **Reliability** — every tier in two zones; RDS Multi-AZ; queue DLQ with an age alert.
> *Residual risk:* a region outage stops checkout; accepted at RTO 4 h by DEC-012.

## The questions that change designs

**Operational excellence** — Is everything in IaC, deployed by a pipeline, with no console change?
Can one person roll back in under five minutes? Do runbooks exist for each alert (§18.3)? Is the
change small enough to ship daily (DORA: deployment frequency, lead time, change failure rate,
failed-deployment recovery time, rework rate)?

**Security** — Least-privilege workload identity, no long-lived keys? Secrets in the secret store,
rotated? Data encrypted at rest with a managed key and in transit with TLS 1.2+? No public data
endpoint? Audit logging (CloudTrail, Activity Log, Cloud Audit Logs, OCI Audit, ActionTrail) on and
retained? Images scanned, signed and pinned (SLSA build provenance, SBOM in SPDX or CycloneDX)?
Policy as code (OPA/Gatekeeper, Kyverno, provider policy: SCPs, Azure Policy, Org Policy)?

**Reliability** — Which failures are survived: instance, zone, region? Health checks that test the
dependency, not just the process? Timeouts, retries with backoff and jitter, circuit breakers on
every call (§13.5)? Backups restored in a test, not just taken? Quotas checked for peak?

**Performance** — Is the slowest dependency known and budgeted (§13.7 `x-perf`)? Caching where a
read dominates? Autoscaling on a signal that leads load (queue depth, RPS) rather than lags it (CPU)?
Data close to compute (same region, same zone for chatty paths)?

**Cost** — What drives the bill (compute, managed DB, egress, NAT, logs)? Is each environment
tagged (`app`, `env`, `owner`, `cost-center`) and budget-alerted? Does non-production scale to zero
or stop at night? Are logs retained for what the retention policy says and no longer? FinOps
Framework phases: inform (allocation, tags, FOCUS billing data), optimize (rightsizing,
commitments), operate (budgets, anomaly alerts).

**Sustainability** — Region with a lower-carbon grid when latency allows; managed and serverless
over idle capacity; right-sized storage tiers and lifecycle rules.

## Scoring

For the ADR's comparison table, score each option per pillar as **meets · partial · gap** with one
line of evidence each. A gap is acceptable only with a named mitigation or a `DEC-NNN` accepting it.
Never average the scores — one gap in security or reliability outweighs any number of "meets".
