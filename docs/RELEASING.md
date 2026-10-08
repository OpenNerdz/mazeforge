# Publishing MazeForge

## Release status

The featured download is available at
[releases/latest](https://github.com/OpenNerdz/mazeforge/releases/latest).
MazeForge is currently beta software. Keep that status explicit in the release
title, opening notice, README and app until testing supports changing it.

GitHub excludes releases marked **Pre-release** from its Latest slot. To show
the recommended beta on the repository homepage, publish it with **Pre-release**
unselected and **Set as the latest release** selected. This is a discoverability
setting; the beta name and compatibility limits still describe the software.
Keep experimental builds marked as prereleases and do not feature them.

## Prepare and validate

1. Update the version in `package.json` and `package-lock.json`, the app version
   references, and `CHANGELOG.md`. Use a beta suffix while the app is in beta.
2. Push the release candidate and require both **Checks** and **Desktop builds**
   to pass for that exact commit. These workflows cover generation and server
   tests, lint, types, dependency audit, secret scanning, source packaging and
   native desktop smoke tests on all four supported platforms.
3. Download the `mazeforge-release` artifact from Checks and all four `desktop-*`
   artifacts from Desktop builds for the same commit. Do not mix workflow runs
   from different commits. Extract the workflow artifact containers before
   uploading their enclosed release archives.
4. Verify the version in every archive name. The release needs the source ZIP,
   Windows x64 ZIP, macOS ARM64 ZIP, macOS x64 ZIP and Linux x64 tar.gz.
5. Generate one `SHA256SUMS.txt` covering all five archives. Individual build
   checksum files must not overwrite the combined manifest. Download the final
   assets and verify every checksum before featuring the release.

## Publish

Create a tag `v<package.json version>` pointing to the validated commit. Create
a draft GitHub release for that existing tag, then attach all five archives and
the checksum manifest. Write notes with direct download links for each platform,
launch instructions, changes, compatibility limits, unsigned-build guidance,
and links to the validation runs. Distinguish the source ZIP, which needs Python,
from desktop downloads, which include it.

Review the draft's files and notes, then publish using the status policy above.
Confirm the repository's Releases sidebar and `/releases/latest` show the intended
version, and that all download links work. Leave older releases available.

Published archives and tags identify a specific build: do not replace them with
new code. Fixes should receive a new version, validated commit and release.

## Publishing with the Release workflow

The **Release** workflow performs steps 3–5 and the publishing steps above. Once
Checks and Desktop builds pass for the commit that set the version, add the
notes as `.github/release-notes/v<version>.md` (`{{COMMIT}}`, `{{CHECKS_RUN}}` and
`{{DESKTOP_RUN}}` are filled in), then choose **Actions → Release → Run workflow**
and enter the version. It refuses a version whose tag exists or whose builds have
not passed, verifies every build's own checksum, tags that exact commit, checks
the draft's six files against `SHA256SUMS.txt`, and publishes it as the Latest
release. Release versions oldest first, so the newest ends up as Latest.
