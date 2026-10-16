# Multi-Agent Review — 1 agent vs 3 agents (AC-31, AC-32)

Measured 2026-10-16 on a local stack (API on :3101, shared dev Postgres), PR #23 of `burnjohn/quick-blog` (`39f707c4-508d-4223-8894-d2d9068df778`), provider `openrouter`, model `deepseek/deepseek-v4-flash` for every agent. The 1 agent (Security Reviewer) is one of the 3. One sample per side; nothing below is adjusted toward 3×.

## 1 agent — parent `4c01e1d3-851f-4028-a4e1-3bca78199454`
| Agent | Run id | Duration | Tokens in | Tokens out | Cost |
|---|---|---|---|---|---|
| Security Reviewer | `54f6a036-fc04-4706-9972-e3dd9bd4a54e` | 44.0 s | 13878 | 1669 | $0.002410 |

Parent wall-clock: 44.0 s · sum of child durations: 44.0 s · tokens in/out: 13878/1669 · cost: $0.002410

## 3 agents — parent `3f946351-8b6d-417c-ba49-e4a6c8d46a69`
| Agent | Run id | Duration | Tokens in | Tokens out | Cost |
|---|---|---|---|---|---|
| Security Reviewer | `ab4cbb1c-fdaf-4fd7-84a3-98397ee3f4a3` | 82.7 s | 13878 | 2753 | $0.002714 |
| Test Quality Reviewer | `ba4b03ff-879b-4ac2-b118-ecf889dbb660` | 85.7 s | 14999 | 5441 | $0.003623 |
| API Contract Reviewer | `e6f2b63a-e953-44f3-9a9e-23d0a653fe4c` | 37.2 s | 15198 | 1286 | $0.002488 |

Parent wall-clock: 85.7 s · sum of child durations: 205.5 s · tokens in/out: 44075/9480 · cost: $0.008825

## Ratios (3-agent run ÷ 1-agent run, two decimals)
| Quantity | 1 agent | 3 agents | Ratio |
|---|---|---|---|
| Wall-clock time | 44.0 s | 85.7 s | **1.95** |
| Sum of per-agent durations | 44.0 s | 205.5 s | **4.67** |
| Tokens in | 13878 | 44075 | **3.18** |
| Tokens out | 1669 | 9480 | **5.68** |
| Tokens total | 15547 | 53555 | **3.44** |
| Cost | $0.002410 | $0.008825 | **3.66** |

Concurrency check: 3-agent wall-clock 85.7 s is below the sum of its children 205.5 s (ratio 0.42), so the agents ran in parallel.

## Observed causes of the deviation from 3×
- **Wall-clock is about 2× (not 3×)** because the agents run concurrently: the parent finishes when the slowest child finishes (Test Quality, 85.7 s), not after the sum.
- **Sum of durations is above 3×** mainly because the *same* Security agent took 44.0 s alone and 82.7 s in the 3-agent run on an identical input (13878 tokens in both): provider latency varies run to run, and one sample cannot separate that from any effect of running in parallel.
- **Tokens in are close to 3×** (the diff and PR context are the same; each agent adds its own system prompt, so the inputs differ slightly: 13878, 14999, 15198).
- **Tokens out and cost are above 3×** because response length is not controlled: the same Security agent produced 1669 output tokens alone and 2753 in the 3-agent run, and the Test Quality agent wrote 5441. Output tokens are the expensive side, so cost follows them.
- No shared-preparation saving is visible in tokens or cost: each agent is its own LLM call with its own prompt; only the diff load and intent preparation are shared (not billed as agent tokens here).
- Caveats: one sample per side, a cheap model, and a shared dev database.

## Invalid run kept for the record
Parent `1ac93669-42c3-490e-b5ba-9bc7c186ea95` (same PR, same 3 agents) was started first and is **excluded**: its Security child was marked `failed` with no error and no duration about two minutes after it started, while the parent never got `finished_at`. A second API server (another worktree on :3001) restarted at that moment against the same Postgres; on boot it marks every `running` run `failed`. Its two other children finished (Test Quality 78091 ms, API Contract 35293 ms) but the run is not a valid 3-agent sample. The valid run above was repeated after that server was stable.

## SQL used
```sql
select m.id, m.duration_ms as parent_ms, a.agent_name, a.id, a.duration_ms, a.tokens_in, a.tokens_out, a.cost_usd
from multi_agent_runs m join agent_runs a on a.multi_agent_run_id = m.id
where m.id in ('4c01e1d3-851f-4028-a4e1-3bca78199454', '3f946351-8b6d-417c-ba49-e4a6c8d46a69') order by m.ran_at, a.ran_at;
```
