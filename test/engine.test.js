const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/engine.js');

const past = { kind: 'bullets', tense: 'past' };
const present = { kind: 'bullets', tense: 'present' };
const fix = (t, mode, ctx) => A.transform(t, mode, ctx || past).text;

test('spelling', () => {
  assert.equal(fix('Recieved alot of praise from managment', 'fix'), 'Received a lot of praise from management');
});
test('grammar', () => {
  assert.equal(fix('Closed the the deal', 'fix'), 'Closed the deal');
  assert.equal(fix('Built a outbound playbook', 'fix'), 'Built an outbound playbook');
  assert.equal(fix('Led an unified team', 'fix'), 'Led a unified team');
  assert.equal(fix('i closed 12 deals', 'fix', { kind: 'summary' }), 'I closed 12 deals');
  assert.equal(fix('We should of won more then 5 deals', 'fix', { kind: 'plain' }), 'We should have won more than 5 deals');
});
test('awkward phrasing', () => {
  assert.equal(fix('Was responsible for managing 5 reps', 'awkward'), 'Managed 5 reps');
  assert.equal(fix('Was able to reduce churn 9%', 'awkward'), 'Reduced churn 9%');
  assert.equal(fix('Conducted an analysis of 40 accounts', 'awkward'), 'Analyzed 40 accounts');
});
test('concise', () => {
  assert.equal(fix('Called 50 leads in order to book meetings', 'concise'), 'Called 50 leads to book meetings');
  assert.equal(fix('Really improved win rate 10%', 'concise'), 'Improved win rate 10%');
  assert.equal(fix('I managed 8 accounts', 'concise'), 'Managed 8 accounts');
});
test('tone', () => {
  assert.equal(fix("Didn't miss quota and got a lot of referrals!", 'tone'), 'Did not miss quota and earned many referrals.');
});
test('stronger verbs and tense', () => {
  assert.equal(fix('Worked on 30 renewals', 'verbs'), 'Developed 30 renewals');
  assert.equal(fix('Manage 45 accounts', 'verbs'), 'Managed 45 accounts');
  assert.equal(fix('Manages 45 accounts', 'verbs', present), 'Manage 45 accounts');
  assert.equal(fix('Closed $2M in 2023', 'verbs', present), 'Closed $2M in 2023');
  assert.equal(fix('Helped build a CRM', 'verbs'), 'Contributed to building a CRM');
});
test('resume tips are advice only', () => {
  const s = A.analyze('Team player who closes deals', past);
  assert.ok(s.some((x) => x.type === 'resume' && /cliché/.test(x.message)));
  assert.ok(s.some((x) => x.type === 'resume' && /measurable/.test(x.message)));
});
test('repeated lead verbs across resume', () => {
  const res = A.analyzeResume([{ path: 'a', text: 'Managed 5 reps\nManaged 10 accounts\nManaged $2M pipeline', ctx: past }]);
  assert.equal(res.a.filter((s) => s.type === 'repeat').length, 2);
});
test('rephrase offers alternatives', () => {
  const opts = A.rephrase('Increased revenue 30% by launching a referral program', past);
  assert.ok(opts.includes('Launched a referral program, increasing revenue 30%'));
  assert.ok(opts.length >= 2);
});
test('clean text stays unchanged', () => {
  const t = 'Grew enterprise pipeline 40% in 2023 by launching an outbound program';
  assert.equal(fix(t, 'polish'), t);
});
test('structure: several points in one line become bullets', () => {
  const t = 'Grew revenue $1.2M in Q3. Cut churn 9% with a new onboarding flow. Hired 3 reps.';
  const s = A.analyze(t, past).find((x) => x.type === 'resume' && x.replacements.length);
  assert.equal(s.replacements[0], 'Grew revenue $1.2M in Q3.\nCut churn 9% with a new onboarding flow.\nHired 3 reps.');
  assert.ok(!A.analyze('Grew revenue $1.2M in Q3 and hired 3 reps.', past).some((x) => /points in one line/.test(x.message)));
});
test('structure: paragraphs over 7 lines', () => {
  const long = 'Built pipelines for finance teams across regions. '.repeat(15);
  assert.ok(A.analyze(long, { kind: 'summary' }).some((x) => /Split anything over 7 lines/.test(x.message)));
  assert.ok(!A.analyze('Built pipelines for finance teams.', { kind: 'summary' }).some((x) => /7 lines/.test(x.message)));
});
