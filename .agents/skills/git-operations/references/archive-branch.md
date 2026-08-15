# Archive branch

Preserve one exact revision under an explicitly approved archive branch without disturbing the working tree.

1. Resolve the source branch or revision, repository and remote, current working-tree state, and whether unpublished commits or local changes require separate preservation.
2. Propose concise archive names when none is approved. Never infer a final name from the first suggestion.
3. Show the exact source revision, destination ref, and remote. Wait for explicit approval of all three before mutation.
4. Create or push the archive ref directly without switching branches when the installed Git interface supports it.
5. Verify that the resulting local or remote archive ref resolves to the approved source revision.
6. Do not delete, reset, rewrite, switch, merge, commit, push unrelated refs, or continue the original branch operation without separate explicit authority.

Return only the archive ref, verified revision, location, and any preservation risk.
