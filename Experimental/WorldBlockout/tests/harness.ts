let pass = 0, fail = 0;
const lines: string[] = [];
export function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; lines.push(`  ok   ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; lines.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
export function report() {
  const line = '─'.repeat(72);
  console.log(`\n${line}\n${lines.join('\n')}\n${line}`);
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
