let pass = 0, fail = 0;

export const ok = (cond, label, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL'), label.padEnd(72), cond ? '' : extra);
  cond ? pass++ : fail++;
};

// deterministic "random" so a weighted pick never flakes
export const rng = () => 0.5;

export function done() {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
