# Test-First Loop

A vertical slice is one public seam, one failing behavior, and the smallest implementation that makes it pass.

1. **Red:** add one public-behavior test. Confirm it fails for the intended reason.
2. **Green:** implement only the behavior required by that test.
3. **Repeat:** let each passing slice determine the next useful case.
4. **Refine:** after behavior is green, remove accidental complexity without changing the seam.

Expected values come from the requirement, protocol, or a worked example independent of the implementation.
