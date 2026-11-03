import { buildFftChain, planSimSteps } from '../src/gpu/oceanChain.ts';
import { check, report } from './harness.ts';

console.log('FFT pass chain');
for (const n of [64, 128, 256]) {
  const chain = buildFftChain(n);
  const expected = (Math.log2(n) + 1) * 2;
  check(`N=${n} plans ${expected} passes`, chain.passes.length === expected, `${chain.passes.length} passes`);
  let consistent = true;
  let ptr = 0 as 0 | 1;
  for (const p of chain.passes) {
    if (p.read !== ptr) consistent = false;
    if (p.write === p.read) consistent = false;
    ptr = p.write;
  }
  check(`N=${n} each pass reads the previous output`, consistent && ptr === chain.result,
    `result parity ${chain.result}`);
  // A trailing resolve reading `chain.result` is the only reader of the finished transform.
  check(`N=${n} resolve reads the final parity`, chain.result === ((expected % 2 === 0) ? 0 : 1));
}

console.log('Sim ping-pong');
{
  const a = planSimSteps(0, 3);
  check('3 steps from parity 0 end in 1', a.endParity === 1, a.writeParity.join(','));
  const b = planSimSteps(1, 1);
  check('1 step from parity 1 ends in 0', b.endParity === 0);
  const c = planSimSteps(0, 6);
  check('even step count returns to the start parity', c.endParity === 0);
  let prev = 0 as 0 | 1;
  const ok = planSimSteps(0, 5).writeParity.every((w) => { const good = w !== prev; prev = w; return good; });
  check('no step writes into the texture it reads', ok);
}
report();
