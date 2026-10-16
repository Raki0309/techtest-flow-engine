# Flow builder revamp

The builder now lets a partner understand a flow at first sight, without clicking into any box. Every box lists its outgoing rows, each with its condition in plain words, so you can see where a visitor goes and why.

**How to read a flow.** Numbered rows are tried in order: 1 first (the bold line), then 2, and so on. If none match, the visitor falls through to the "Otherwise" row (dashed). A/B splits show their percentages in blue. Each filter shows in red what happens to the visitors it catches: a line dropping into a "404 page" or "Challenge" box below it, or a red row leading on to its fallback offer. Tracking pixels use a dotted purple line and carry a one-line explanation of what they do. The legend in the builder explains every line style.

**How to troubleshoot.** "Problems (n)" in the top bar lists everything wrong in the flow; boxes carry a matching badge, and clicking a problem jumps to it. "Test a visitor" runs the real engine for a sample visitor and lights up the path they take.

**Fallback offers.** A filter can send the visitors it catches to an offer instead of a 404: under "What happens to them?" pick "Send to a fallback offer", then press "+ New fallback offer" and pick the offer right there, or drag the red "+ fallback" handle on the filter onto an offer that's already in the flow. Visitors continue from there, so a fallback can also lead to a page and rejoin the flow. Boxes only reached this way sit in a lane under the flow. In the sample, ad reviewers go to a safe offer. In the flow file the fallback is a line with `caught: true`; old flows still route exactly as before.

**Where it lives.** The builder is in `flow-builder/` and opens with `examples/checkpoint-flow.json`: run `cd flow-builder && npm install && npm run dev`, and click "Load sample flow" if an older flow appears. `npm test` runs all suites. The engine's new optional connection `priority` stays compatible with older flows that don't have it.
