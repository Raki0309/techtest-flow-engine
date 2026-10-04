# Checkpoint flow 

Added checkpoint flow: filters first, then audiences, landers, offers

Reviewers, bots and VPN traffic are stopped before any routing; real
visitors are then split by audience.

**What it does.** Every visitor from the campaign first passes three checkpoints, in this order: known ad reviewers get a 404, bots get a 404, and visitors on a datacenter/VPN connection get a click-to-continue challenge for 8s. Real visitors are then sorted into an audience (US mobile, Europe, everyone else), see a landing page and end on an offer. US mobile is A/B tested 50/50 between two quiz pages.

**Where it is.** `examples/checkpoint-flow.json` holds the flow. The builder opens with it (`npm run dev` in `flow-builder/`; if an older flow appears, click *Load sample flow*). `npm test` checks that the flow is valid and that each kind of visitor ends up where it should.

**Good to know.** The bot and VPN checkpoints are written directly in the JSON, because the builder's rule editor has no buttons for those conditions. Picking a rule from the dropdown on them would replace their condition. The ad reviewer checkpoint relies on the "Known ad reviewer" rule; if that rule is missing, the checkpoint stops nobody.
