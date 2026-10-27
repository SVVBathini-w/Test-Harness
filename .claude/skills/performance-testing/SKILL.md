---
name: performance-testing
description: Establish performance baselines and validate response time, throughput, concurrency, resource use and degradation against quantified SLOs. Use when designing or running layer 8 tests, when asked whether something is fast enough, or when a change risks latency. Generate load only against an authorised, non-production, non-shared target; single-transaction timing is safe anywhere.
---

# Performance testing

## Authorisation is a precondition

Load testing runs only against an authorised, non-production, non-shared target. Generating load against a shared environment degrades other people's work and against production is an outage you caused.

Single-transaction timing and client-side measurement are safe anywhere and are usually the more useful result.

## Define the SLO first

A performance test without a threshold produces a number nobody can act on. Before running anything, state:

```
| Transaction | Metric | Target | Breach threshold | Source of the target |
```

Use percentiles, never averages. An average hides the tail where users actually suffer. p50, p95 and p99 tell three different and necessary stories.

Where no SLO exists, that absence is the finding. Establish a baseline, record it as `approved-baseline`, and ask for a target.

## What to measure

| Dimension | Measure |
|---|---|
| Response time | p50, p95, p99 per critical transaction |
| Throughput | Requests per second sustained without breaching the SLO |
| Concurrency | Behaviour as concurrent users rise — where does the curve bend |
| Resource use | CPU, memory, connections, threads under sustained load |
| Degradation | Does it slow gracefully or fall over |
| Recovery | Does it return to baseline after load stops |
| Front end | Largest Contentful Paint, Interaction to Next Paint, Cumulative Layout Shift, total transferred bytes |

## Test shapes

- **Baseline** — single user, no contention. Establishes the floor and is the only number many projects actually need.
- **Load** — expected peak concurrency, sustained. Validates the SLO.
- **Stress** — increase until failure. Finds the bend and the failure mode.
- **Soak** — expected load over hours. Finds leaks and resource exhaustion.
- **Spike** — sudden surge. Tests elasticity and queueing.

Start with baseline. Most performance defects are visible with one user: an N+1 query, an unbounded result set, a missing index, a synchronous call that should be parallel.

## Method

1. Warm up, then discard the warm-up results.
2. Run enough iterations for the percentile to mean something. Five samples do not have a p95.
3. Hold the environment constant — same data volume, same cache state, same instance size. A comparison across different conditions is not a comparison.
4. Record the conditions alongside the numbers. A result without its conditions cannot be reproduced or compared.
5. Measure the server and the client separately. "The page is slow" resolves to backend time, transfer time, or render time, and the fix differs entirely.

## Diagnosis

A number is not a finding. Attribute it: which query, which call, which asset, which lock. Correlate the run with server-side traces and database timings.

Common causes worth checking first: N+1 queries, missing index, unbounded result set, synchronous external calls in series, oversized payloads, absent caching, connection pool exhaustion.

## Reporting

Report the metric, the target, the actual, the conditions, and the attributed cause. Store raw results in `runs/<run-id>/evidence/performance/` so the next run has something to compare against.

