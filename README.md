# still-widgets

The widget catalog for [Still](https://github.com/lljzzz/still). Everything in here shows up in the app's Market.

Each widget lives in its own folder as a single `widget.still.json` file. When a pull request gets merged, a GitHub Action rebuilds `index.json`, and that's the file Still downloads. There's no server involved; GitHub hosts it.

## Adding your widget

1. Build it in Still. A widget made with sliders works, and so does one you coded yourself.
2. Open it in the editor and click **Export**. You'll get a `.still.json` file.
3. Fork this repo and put the file at `widgets/<your-widget>/widget.still.json`. The folder name becomes the widget's permanent ID, so stick to lowercase letters, numbers and dashes, like `widgets/rain-clock/`.
4. Open the file and look over `name`, `author` and `description`. The description is the first thing people read in Market, so say what the widget shows.
5. Open a pull request.

A check runs on every pull request and tells you exactly what's wrong if the file doesn't fit the format. You can run the same check yourself before pushing:

```bash
node scripts/build-index.mjs --check
```

Don't edit `index.json` yourself. It's rebuilt automatically after a merge, and it can take a few minutes after that for the new widget to show up in Market, because GitHub caches the file.

## Writing code widgets

If the built-in widget types can't do what you want, write it. In Still, go to **My widgets → New widget**. You get an editor with HTML, CSS and JavaScript tabs, a live preview, and a Fields tab where you describe the settings people can change.

A quick tour of the `still` object your code gets:

| | |
| --- | --- |
| `still.values` | Your settings, by key |
| `still.on("values", fn)` | A setting changed |
| `still.on("audio", fn)` | `{ level, peak, bands, wave }` about 30 times a second while sound plays. Needs Audio. |
| `still.on("metrics", fn)` | CPU, memory, disks, network and uptime every second. Needs System metrics. |
| `still.on("theme", fn)` | The user changed colors or the font |
| `still.on("resize", fn)` | The widget was resized; sizes are in `still.size` |

In CSS, `var(--accent)`, `var(--text)`, `var(--muted)` and `var(--font)` follow the user's Appearance settings. Use them and people can restyle your widget without touching your code. `music-bars`, `waveform` and `analog-clock` in this repo are short, readable examples.

Code widgets run in a sandbox: no network, no files, no access to the rest of Still. Images and fonts have to be embedded as `data:` URLs. Keep the whole thing under 128 KB.

## What reviewers look for

- The check passes.
- The name and description match what the widget actually does.
- Text in the widget is fine for anyone to see.
- For code widgets: it only asks for Audio or System metrics if it uses them, and it doesn't burn CPU for no reason (draw with `requestAnimationFrame`, and skip work when nothing changed).
- The folder name isn't taken.

## Updating a widget

Change its `widget.still.json` in a new pull request. People who already have it keep their copy; installing it again from Market gets the new version.

## How this repo is laid out

```
widgets/<id>/widget.still.json   one folder per widget
index.json                       built by the Action, read by Still
schema/package.schema.json       the package format
scripts/build-index.mjs          the checker and index builder (plain Node, no dependencies)
.github/workflows/catalog.yml    runs the checker on pull requests and rebuilds after merges
```

## License

Everything here is [MIT](LICENSE). By opening a pull request you agree to share your widget under the same license.
