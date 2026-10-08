# Flow builder revamp

The builder now lets a partner understand a flow at first sight, without clicking into any box. Every box lists its outgoing rows, each with its condition in plain words, so you can see where a visitor goes and why.

**How to read a flow.** Numbered rows are tried in order: 1 first (the bold line), then 2, and so on. If none match, the visitor falls through to the "Otherwise" row (dashed). A/B splits show their percentages in blue. Each filter has a red line dropping into a "404 page" or "Challenge" box below it. Tracking pixels use a dotted purple line and carry a one-line explanation of what they do. The legend in the builder explains every line style.

**How to troubleshoot.** "Problems (n)" in the top bar lists everything wrong in the flow; boxes carry a matching badge, and clicking a problem jumps to it. "Test a visitor" runs the real engine for a sample visitor and lights up the path they take.

**Where it lives.** The builder is in `flow-builder/` and opens with `examples/checkpoint-flow.json`: run `cd flow-builder && npm install && npm run dev`, and click "Load sample flow" if an older flow appears. `npm test` runs all suites. The engine's new optional connection `priority` stays compatible with older flows that don't have it.
