# Gray Release Checklist

- Build info recorded: commit SHA, branch, actor, date, app version, Rust
  version, Flutter version.
- PR Fast Gate passed.
- Main Full Gate passed.
- Gray Release Gate passed.
- P0 private text E2EE acceptance passed.
- P1 OPK lifecycle passed.
- P1 private multi-device fanout passed.
- P1 group E2EE passed.
- DB plaintext scan passed.
- Coverage summaries reviewed.
- Manifest summaries reviewed.
- Known failures reviewed; no wildcard or expanded allowlist.
- Required manual checks completed.
- Rollback notes prepared.
- Final decision recorded as GO or NO-GO.
