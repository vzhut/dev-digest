# Skill import fixtures

`breaking-change-checklist.zip` is the demo import for the API Contract Reviewer
(specs/skills.md section 7). It is deliberately NOT seeded: import it through the
Skills page (Add skill, upload zip) so the preview and confirm steps are exercised.

- `SKILL.md` and `references/semver-for-apis.md` are imported (the reference file is
  listed as included).
- `install.sh` is a decoy executable: the preview must list it as ignored and
  nothing is ever run.

`breaking-change-checklist/` is the unzipped source, kept for review. Rebuild the
archive after editing it:

```
cd docs/skill-fixtures/breaking-change-checklist && \
  python3 -c "import zipfile,os;z=zipfile.ZipFile('../breaking-change-checklist.zip','w',zipfile.ZIP_DEFLATED);[z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f))) for r,_,fs in os.walk('.') for f in sorted(fs)];z.close()"
```
