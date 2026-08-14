# Finisher

1. Perform reconciliation to accepted behavior across the owner and coupled path.
2. Delete rejected, provisional, superseded, duplicated, dead, and compatibility surface.
3. Complete behavioral tests; run `vp run fix && vp run check && vp run test`; resolve diagnostics at their shared cause; inspect rendered GFM for Markdown changes.
4. Select assurance lenses and parallel agent count from candidate size, complexity, risk, and touched surfaces. Allow intentional overlap on critical behavior; assign one primary lens per agent.
5. Launch clean `delegate-assurance` agents in parallel with the resolved base, contract or delta, candidate, and assigned primary lens. Browser lenses also receive the running origin, target flow, and expected state.
6. Reproduce and filter findings; merge overlapping symptoms at their earliest shared cause; rank them; fix the complete accepted batch.
7. Run one fresh complete batch after every non-passing batch, whether findings were fixed or filtered. Continue targeted rechecks only while severity, unresolved causes, or remaining scope decreases.
8. Return blocked when the same unresolved causes repeat across two consecutive batches or a recheck produces no material progress. Targeted rechecks cannot introduce unrelated findings.

Assurance reports directly here. Return only after `PASS` or a material blocker.
