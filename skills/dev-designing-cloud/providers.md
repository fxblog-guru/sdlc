# Providers — choosing one, and naming its services

Read with `SKILL.md` step 1 and 3. The adapter in `scripts/lib/clouds.mjs` is the authority for
which service a kind becomes on each provider; `topology.mjs table <slug> --as aws,azure,gcp,alibaba,oci`
prints it for your model. This file is the judgement the table cannot carry.

## The five, and what separates them

Market share is Synergy Research's, Q2 2026: AWS ~28 %, Microsoft ~21 %, Google ~15 %, Oracle and
Alibaba ~4 % each. Share says where hiring and tooling are easy; it does not pick your cloud.

| Provider | Choose it when | Watch for |
|---|---|---|
| **AWS** | the widest managed-service catalogue matters; the team already runs it; the region you need is AWS-only; you want the deepest third-party ecosystem (Terraform modules, marketplace) | service sprawl — three ways to do everything; cross-AZ and NAT data charges; IAM complexity |
| **Azure** | the organisation runs Microsoft 365 / Entra ID / Windows / .NET / SQL Server; enterprise agreements already include credit; hybrid with on-premises (Arc) | naming churn (services renamed often); per-region service availability; quota requests for larger SKUs |
| **Google Cloud** | data and analytics (BigQuery), Kubernetes (GKE is the reference), simple serverless containers (Cloud Run), global networking on one VPC | fewer enterprise managed services than AWS/Azure; support tiers; some products deprecated on short notice |
| **Oracle (OCI)** | Oracle Database / Exadata / Autonomous DB workloads; egress-heavy workloads (OCI's egress allowance is large); GPU capacity deals | smaller managed catalogue and community; fewer Terraform modules; draw.io has no built-in OCI icon set (the adapter draws OCI cards) |
| **Alibaba Cloud** | users or data must be in mainland China or the wider APAC region Alibaba leads; ICP filing and China compliance | English documentation lags; global regions are fewer; check each service's international availability |

**Kubernetes is not a provider.** EKS, AKS, GKE, ACK and OKE run the same API. Choosing Kubernetes
makes the workload portable; it does not make the database, the queue or the IAM portable.

## Decision rules, in order

1. **A constraint already decided it** — residency, compliance attestation, an existing enterprise
   agreement, an approved-provider list in `DEV-PROFILE §Cloud`. Cite it and stop.
2. **Where the team can be paged.** A provider nobody on the rota has operated is a reliability risk
   that no pillar score shows. Weight it explicitly.
3. **The managed service the design depends on.** If the design needs BigQuery, Cosmos DB's multi-
   region writes, Aurora's storage, Spanner, or Autonomous DB, the provider follows the service.
4. **Cost at the expected scale**, as an order of magnitude with its driver (compute hours, egress,
   managed-DB storage, NAT processing). Do not quote list prices to the cent — they change and
   discounts dominate. Say "≈ US$ 400–700 / month, driven by two DB instances and NAT egress".
5. **Multi-cloud only for a named reason** (regulatory exit plan, a customer's mandate, a provider
   outage you must survive). Running one workload across two providers doubles the operating
   surface; "avoiding lock-in" alone does not pay for it. Prefer: one provider per workload, portable
   build artefacts (OCI images, OpenTofu), and an exit plan written in the ADR.

## Service equivalence beyond the registry

The registry maps the kinds a topology uses. For anything else, use the providers' own maps, dated:

- Microsoft: AWS to Azure — <https://learn.microsoft.com/azure/architecture/aws-professional/>;
  Google Cloud to Azure — <https://learn.microsoft.com/azure/architecture/gcp-professional/services>
- Google: AWS / Azure / Google Cloud comparison — <https://cloud.google.com/docs/get-started/aws-azure-gcp-service-comparison>
- Oracle: OCI for AWS / Azure architects (Oracle Architecture Center)
- Alibaba: the migration guides map AWS services per product line

These pages change. Quote the row you rely on, with the date you read it, in the ADR.

## Names that trip people

| Neutral kind | AWS | Azure | Google Cloud | Alibaba | OCI |
|---|---|---|---|---|---|
| network | VPC | VNet | VPC network (global) | VPC | VCN |
| subnet | subnet (one AZ) | subnet (regional) | subnet (regional) | vSwitch (one zone) | subnet (regional or AD) |
| zone | Availability Zone | availability zone | zone | zone | availability domain + fault domain |
| account scope | account / organization | subscription / management group | project / folder / organization | account / resource directory | tenancy / compartment |
| region group | region | region (+ paired region) | region | region | region |

An AWS subnet lives in one zone, so a two-zone AWS design draws two subnets per tier; Azure, GCP and
OCI regional subnets span zones, so the zone is drawn inside the subnet or not at all. Draw what the
provider means, not what the other provider would.

## Icons and their licences

The diagrams use each provider's official set through draw.io: AWS Architecture Icons (CC BY-ND
2.0 — use unmodified, do not imply endorsement), Azure architecture icons (Microsoft terms:
architecture diagrams and documentation, unaltered), Google Cloud icons (brand guidelines, shipped
colours), Alibaba Cloud icons, Kubernetes community icons (Apache-2.0 / CC-BY-4.0). Never recolour,
crop or combine an icon; the adapter's styles keep them as shipped.
