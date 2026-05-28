# Cherry-Pick Workflow Reference

Load this file when:

- You have a verdict (winner picked, loser cherry-pick list drafted) and are about to enter Phase 5 (Execute).
- A first-pass "nothing to port" result needs a rigorous Phase 6 calibration pass.
- A cherry-pick conflicts, a test fails after applying it, or a worktree-bound branch refuses to delete after merge.
- You need a copy-pasteable HEREDOC template for cherry-pick commits, merge bodies, or loser-close comments.

Everything here is operational detail extracted from the SKILL.md body so the agent can keep the core skill terse while still having a deep playbook one load away.

## 1. Pre-cherry-pick guardrails

Before you reach for `git cherry-pick`, run these checks for every commit on your candidate list:

1. **Is the commit already on main via the winner?**
   The winner's branch was rebased or re-rolled by the same tooling that produced the loser. Whole subtrees may already be present.

   ```bash
   # In the winner's worktree
   git log <loser-sha>..HEAD -- <touched-paths>
   git log HEAD..<loser-sha> -- <touched-paths>
   ```

   If the second command shows no commits unique to the loser for those paths, the cherry-pick is empty — skip it. (See Gotcha #1 in SKILL.md.)

2. **Does the loser's commit depend on a parent commit you are *not* taking?**
   Walk `git log --reverse <loser-base>..<loser-sha>` and check whether earlier loser commits introduced symbols the target commit relies on. If yes, either:
   - Cherry-pick the prerequisite commits too (preferred when they are clean), or
   - Hand-port the change as an edit and reference the loser SHA in the commit body.

3. **Will the cherry-pick step on uncommitted cherry-picks already in the winner's tree?**
   Run `git status` in the winner's worktree. If you already applied edits in Phase 4 synthesis, commit or stash them before the next `git cherry-pick` so the conflict surface is unambiguous.

## 2. Pick the right porting mode

| Loser change shape | Preferred mode | Why |
|---|---|---|
| A clean single-purpose commit on a stable base | `git cherry-pick <sha>` | Preserves authorship, message, and a backlink. |
| A small fix buried in a noisy commit | Hand-edit, then commit with `Refs: <loser-sha>` in the body | Avoids importing unrelated churn. |
| A new test file the winner lacks | `git checkout <loser-sha> -- <path>` then commit | Atomic, ignores commit boundaries. |
| A docstring/comment improvement | Hand-edit | Not worth the merge-conflict surface area. |
| A regression test for a shared limitation | Cherry-pick or hand-port, then **fix the underlying bug on the winner** | The test is load-bearing — failing it is the point. |

Rebase-style cherry-picks (`git cherry-pick -x`) annotate the new commit with the source SHA — useful when you want the audit trail without writing it by hand. The `-x` line survives squash-merge to main as part of the squashed body.

## 3. Cherry-pick conflict handling

When `git cherry-pick` halts on a conflict:

1. **Inspect the conflict markers carefully.** Stale rebases on the loser's branch can leave conflict markers that were never resolved upstream. If you see triple-marker artifacts (`<<<<<<<`, `=======`, `>>>>>>>` plus an unexpected `|||||||` ancestor line), the loser branch itself is broken — abort with `git cherry-pick --abort` and surface this in the close comment.

2. **Decide: resolve or abort.**
   - Resolve if the conflict is a trivial overlap (e.g. same import line) and the loser's intent is still clear.
   - Abort if resolving requires reconstructing the loser's intent from scratch — at that point you are writing fresh code, not cherry-picking, and you should drop the candidate or hand-port a smaller piece.

3. **After resolving:** stage, then `git cherry-pick --continue`. Do **not** use `--no-edit` blindly — read the auto-generated message and add a line explaining the resolution if non-obvious.

4. **Run the full verification suite after each cherry-pick, not after the batch.**
   If a cherry-pick breaks tests, you want to know which one. Batching cherry-picks and running tests once at the end forces a bisection you could have avoided.

## 4. Verification gate before merging

Before pushing the winner's branch and invoking `gh pr merge`:

```bash
# In the winner's worktree, run all of these in order:
git status                          # must be clean
npm run typecheck                   # or project equivalent
npm run test                        # or project equivalent
npm run test:<scoped-suite>         # any feature-specific suite the PRs touched
# Plus any drift checks, benchmarks, or integration smokes the repo exposes.
```

If any step fails, the cherry-pick batch is not ready. A failing cherry-picked test is a real bug discovery — fix it on the winner's branch before merging.

## 5. HEREDOC templates

### Cherry-pick commit (when consolidating several cherry-picks into one commit)

```bash
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
<subject: short verb-led summary of what was ported>

Cherry-picked from PRs #<X>, #<Y>:
- <path>:<line-range> — <one-line why>
- <path>:<line-range> — <one-line why>

Refs: <loser-sha-1>, <loser-sha-2>

Co-Authored-By: <name> <email>
EOF
)"
```

### Merge winner

```bash
gh pr merge <winner> --squash --delete-branch \
  --subject "<verb-led summary of the merged outcome>" \
  --body "$(cat <<'EOF'
## What this lands

<1-3 sentences on the winning approach.>

## Cherry-picks taken from losers

- From #<X>: <what + file:line>
- From #<Y>: <what + file:line>

## Known shared limitations (deferred)

- <file:line> — <one-line description, link to follow-up issue if filed>

EOF
)"
```

### Loser close comment

```bash
gh pr close <loser> --comment "$(cat <<'EOF'
Closed in favor of #<winner>.

Reason for not winning:
- <file:line> — <specific verified bug or inferiority>

Cherry-picks taken into the winner:
- <file:line> — <what + commit SHA in winner branch>

Shared limitations (not differentiators) tracked as future work:
- <file:line> — <description>
EOF
)"
```

## 6. Post-merge cleanup

- **Local-branch-delete-blocked** errors after a successful merge are expected when a worktree still holds the branch. Note in the final summary; do **not** force-delete unless the user asks.
- Force-pushing to a feature branch after the PR is closed loses review history and breaks links from the closed PR's discussion. Don't do it as cleanup.
- Orphan branches with the same sibling prefix that never opened as PRs (common in t3-managed repos) should be surfaced in the final summary as cleanup candidates — do not delete them unilaterally.

## 7. Rigorous Phase 6 calibration recipe

When the first-pass verdict was "nothing worth porting":

1. Spawn one focused subagent with a prompt that includes:
   - The loser PR diff path (saved in Phase 1 scratch).
   - The post-merge winner's relevant files (`git show origin/main:<path>` output saved to scratch).
   - An explicit instruction to **diff implementations side-by-side and read test bodies**, not just compare test names.
   - An explicit instruction to surface even small wins (helper exports, a single edge-case assertion).
2. Re-verify any new claim with `grep` + a test run, same as Phase 3.
3. If the rigorous pass finds something, apply it as a cherry-pick to main directly (not via re-opening the loser PR) and amend the loser's close comment with the cherry-pick line.

This pass has historically produced real cherry-picks every round it was applied. Make it a habit, not an afterthought.
