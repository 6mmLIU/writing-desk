# Design notes

[中文](DESIGN.md) | **English**

All styles live in the `<style>` block at the top of `index.html`. The design variables (colors, radii, type sizes, motion durations) are in `:root` at the top: change one and it changes everywhere. No front-end framework, no bundler.

## The idea: "a sheet of paper and a writing partner"

- **Three areas, one job each**: the left finds and creates notes; the middle holds only the article; the right helps along the writing process.
- **The mark is an "ink dot"**: navigation and process icons each carry a solid ink dot (class `ink` in `js/ui.js`). When selected, it turns brand blue with a small pop; while AI is working, the dot breathes; a new annotation sweeps in like a highlighter pen.
- **New note**: the top of the left sidebar shows the vault name and two rows, "新建笔记" (new note) and "让 AI 写一篇" (let AI write one). The robot icon blinks; hovering the pen draws a stroke of ink.
- **Status**: the bottom of the left sidebar lists statuses with colored dots and counts. Click to filter; drag a note onto a status to change it.
- **The right panel is a flow line**: write → annotate → score → illustrate → publish, followed by two tools, links and versions. Finished steps get a blue dot and the line fills with ink segment by segment; one line underneath explains the current step.
- **Illustration lives in the right panel**: plan images, copy prompts, draw directly and have AI check them, all in the "配图" step. Select a passage and click "配图" on the toolbar to illustrate just that passage.
- **First use**: the first time each page or step opens, an area is highlighted and a card explains how to use it (`js/tour.js`). Each page header has a guide bar; after you close it, "怎么用" (how to use) brings the introduction back.
- **Color**: mostly grays. Blue is reserved for main actions, links and ink dots. Selected settings are white with an outline; filters and switches are gray or dark. Only four type sizes: 12 / 14 / 17 / 28.
- **Shadows instead of lines**, with generous spacing. No superellipse corners: in Electron they leave paint trails.

## Motion

Only `transform` and `opacity` animate, always with ease-out; anything that slides uses `cubic-bezier(.32, .72, 0, 1)`. With "Reduce motion" turned on in macOS, almost all motion is switched off.

| Where | What happens |
|---|---|
| Segmented controls, the flow line, left navigation, status list, audience-distance levels | One highlight slides from the old choice to the new one (`U.glide` in `js/ui.js`). Even when the whole group re-renders, it remembers where it was and slides from there |
| Switching pages in the left navigation | The old page fades out in 120ms; the new one enters 8px from above or below, depending on navigation direction, with opacity settling first |
| Switching steps in the right panel | Content slides in sideways from the direction of the step, block by block, 30ms apart |
| Opening another note | The same sheet of paper, its content rising in slightly; newly opened tabs pop in |
| Hormone presets | No re-render: each bar slides to its new value |
| Scoring | The arc grows from 0 to the score, the number counts up, and the per-item and "actual vs. target" bars grow one after another |
| Selecting text | The toolbar grows out above the selection; choosing an annotation type expands it in place into an annotation box |
| Sliders, switches, buttons | Press feedback (grow, stretch, shrink to 0.97); see `js/ui.js` |

## Hormones and brain regions

The "人性" (human nature) page has three layers: desires, hormones and memory landing. The last two:

- **Neurotransmitters / hormones**: five colored bars for dopamine, oxytocin, cortisol, serotonin and norepinephrine, the level you want the reader to feel while reading (50 is normal). Five presets: hook, companion, warning, practical, normal rhythm. One sentence below reads out the overall state. Each item's effect, how to write for it and its red line can be expanded and edited.
- **Brain regions, where the memory lives**: brainstem (instinct), amygdala (emotion), hippocampus (episodes), prefrontal cortex (judgment): which layer you want the piece to be remembered in.

These are defaults. The "读者的身体" (the reader's body) card in the writing panel can override them per note, storing only the values you changed. Both go into every prompt; when scoring, the AI estimates the actual levels and shows them next to your target.

## What the lines in the text mean

Two switches each control one kind of marking:

**Score marks** (the score step's "在正文里标出评分依据", show score evidence in the text)

| Looks like | Meaning |
|---|---|
| Red wavy underline | This paragraph has a problem |
| Orange solid underline | This paragraph could be better |
| Green solid underline | This paragraph is well written |

**Local checks** (the bottom bar's "标出问题", mark problems; no AI, checked live against the rules on the settings page)

| Looks like | Meaning |
|---|---|
| Orange dotted underline | Paragraph too long for the current platform |
| Orange wavy underline | AI-sounding pattern, such as "not X, but Y" |
| Red text on pink `[需补证据：…]` | A placeholder: replace it with real evidence or experience before publishing |

Yellow highlighting marks passages you annotated.
