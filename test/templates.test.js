const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/templates.js').ResumeTemplates;

test('formats reorder sections and keep extras', () => {
  const r = T.sampleResume();
  T.applyFormat(r, 'hybrid');
  assert.deepEqual(r.sections.map((s) => s.type), ['summary', 'skills', 'experience', 'education', 'list']);
  T.applyFormat(r, 'functional');
  assert.deepEqual(r.sections.map((s) => s.type), ['summary', 'skills', 'projects', 'education', 'experience', 'list']);
  assert.equal(r.format, 'functional');
  T.applyFormat(r, 'chronological');
  assert.equal(r.sections[1].type, 'experience');
  assert.equal(r.sections.filter((s) => s.type === 'projects').length, 1);
});
test('sheet uses text size and margin settings', () => {
  const r = T.blankResume();
  assert.match(T.renderResume(r), /--rs-fs:14px;--rs-m:96px/);
  r.margin = 'narrow'; r.textSize = 'large';
  assert.match(T.renderResume(r), /--rs-fs:15.33px;--rs-m:48px/);
});
