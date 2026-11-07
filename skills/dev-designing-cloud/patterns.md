# Patterns — shaping the topology

Read with `SKILL.md` step 4. Each pattern says what it costs; the ADR says why that cost is worth
paying here.

## The three-tier baseline

```
users → [edge: DNS, CDN, WAF] → public subnet: load balancer → app subnet: services → data subnet: stores
                                                      ↘ async: queue → workers ↗
```

- **Public subnet** holds only what must take a connection from the internet: the load balancer,
  the NAT gateway, a bastion if one is unavoidable. Never a service, never a store.
- **App subnet** (private) holds the services and workers; outbound internet through NAT or, better,
  private endpoints to the provider's APIs (S3/ECR gateway endpoints, Private Link, Private Service
  Connect, service gateway on OCI).
- **Data subnet** (private, no route to the internet at all) holds databases, caches, file stores.
  Only the app subnet's security group may reach it, on the store's port.
- Managed services outside the VPC (object storage, queues, secrets) are drawn in the region group,
  reached by private endpoint where the provider offers one.

## Availability: zones first, regions only for a reason

| Need | Pattern | Cost |
|---|---|---|
| survive an instance | ≥ 2 replicas behind the load balancer | ~2× compute |
| survive a zone (**production default**) | every tier in ≥ 2 zones; managed DB multi-AZ / zone-redundant | cross-zone traffic; standby DB |
| survive a region | backup & restore → pilot light → warm standby → active-active | rising in that order; active-active needs conflict handling in the data model (G3) |

Pick the region pattern from the **RTO/RPO** in the NFRs, not from ambition:

| RTO / RPO | Pattern |
|---|---|
| hours / hours | backup & restore to a second region (cross-region snapshots, replicated object storage) |
| tens of minutes / minutes | pilot light: data replicated, compute defined in IaC, scaled up on failover |
| minutes / seconds | warm standby: a scaled-down copy running, DNS failover |
| near zero / near zero | active-active: traffic in both, data multi-writer — a G2 and G3 decision, never a G10 one |

## Edge

DNS with health-checked failover; a CDN in front of anything static and, increasingly, of the API
too (TLS termination near users, caching of GETs that allow it); a WAF on the CDN or the load
balancer with the provider's managed rule set plus rate limiting. DDoS protection at the edge is the
provider's default tier unless the threat model asks for more.

## Async and events

Use a **queue** when one consumer must do the work exactly once, eventually (payments, e-mail,
exports); a **topic / event bus** when several consumers react independently; a **stream** when
order and replay matter. Every queue gets a dead-letter queue and an alert on its age, and the
consumer is idempotent (§13.1 idempotency keys). Draw async edges dashed (`async: true`).

## Networking defaults

CIDR plan per environment that never overlaps (peering and VPN later depend on it): a /16 per VPC,
/20–/22 per subnet, room for a second region. No public IP on any compute. Egress through one NAT
per zone in production (one NAT is a single point of failure and a cross-zone charge). Security
groups reference each other, not CIDR ranges.

## Hybrid and on-premises

Site-to-site VPN first (cheap, hours to set up), dedicated interconnect (Direct Connect,
ExpressRoute, Cloud Interconnect, FastConnect, Express Connect) when bandwidth, latency or
compliance require it. Draw the on-premises side as an `onprem` group with the systems the change
touches, and the link as one labelled edge.

## Anti-patterns a reviewer flags

A database with a public endpoint · one NAT for production · state on local disk of autoscaled
compute · a queue with no dead-letter queue · a cross-region design with no stated RTO/RPO · a
single-zone production presented as highly available · Kubernetes for one service · a VPC CIDR that
overlaps another environment's.
