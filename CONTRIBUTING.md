# Contributing

Open an issue for a bug or proposed feature. Include the app version, operating
system, browser, expected result and a share code when it helps reproduce a design.
Remove personal folder paths from screenshots and logs.

Use Node.js 22+ and Python 3.10+. Run `npm ci`, `npm test`, `npm run test:server`,
`npm run check` and `uvx ruff check` before submitting a pull request. For visual
changes, check a wide and a narrow browser window and include a screenshot.

Generation is deterministic. Change `tests/fingerprints.json` only when the output
change is intentional and explained in the pull request. Keep exported block
states consistent with the imported client version; the bundled library targets 1.20.1.

Do not commit imported textures, game files, personal exports, `.env` files or
credentials. Original preview patterns live in `tools/build_preview.py`.
Rebuild three.js with `npm run vendor` after dependency changes, and retain its
license in `THIRD_PARTY_NOTICES.md`.

Contributions are made under the project's MIT license. Security reports should
follow [SECURITY.md](SECURITY.md).
