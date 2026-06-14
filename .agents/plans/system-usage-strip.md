# Add System CPU And Memory Usage To Usage Strip

## Summary

Add a new system row above the existing Claude/Codex usage rows. It shows general host CPU and memory utilization as percentages, not per-process metrics.

## Key Changes

- Extend `@deslop/usage/schema` with `SystemUsage` containing `cpuUtilization` and `memoryUtilization`.
- Extend the `Usage` service with a `system` Effect:
  - CPU from `node:os.cpus()` by sampling CPU times over a short interval.
  - Memory from `node:os.totalmem()` and `node:os.freemem()`.
- Add a `usage.system.watch` RPC stream in the workbench:
  - No payload.
  - Emits `SystemUsage`.
  - Refreshes every 5 seconds.
- Add `systemUsageAtom` in workbench state.
- Update `UsageStrip`:
  - Render the system row first.
  - Use existing dense strip styling.
  - Use lucide icons from `@deslop/components/icons`, likely `Activity`/`Cpu` and `MemoryStick`.
  - Reuse the existing utilization color thresholds.

## Test Plan

- Add a `@deslop/usage` service test that asserts `usage.system` returns CPU and memory utilization between `0` and `100`.
- Run `vp run check`.
- Run `vp run test`.

## Assumptions

- Memory usage means physical RAM utilization from Node's OS APIs, excluding swap.
- CPU usage means whole-system CPU utilization percentage, not load average.
- No new package or dependency is needed.
