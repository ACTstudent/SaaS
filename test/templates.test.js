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
test('photo template shows a valid photo, falls back to initials, and ignores anything else', () => {
  const r = T.sampleResume();
  r.template = 'photo';
  assert.ok(T.TEMPLATES.some((t) => t.id === 'photo'));
  assert.match(T.renderResume(r), /class="rs-photo rs-photo-empty"[^>]*>JR</);
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
  r.contact.photo = jpeg;
  assert.ok(T.renderResume(r).includes(`<img src="${jpeg}" alt="">`));
  for (const bad of ['javascript:alert(1)', 'https://example.com/me.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,abc" onerror="x']) {
    r.contact.photo = bad;
    const html = T.renderResume(r);
    assert.ok(!html.includes('<img'), bad);
    assert.ok(!html.includes('onerror'), bad);
  }
  // The photo never leaks into the plain-text export
  r.contact.photo = jpeg;
  assert.ok(!T.plainText(r).includes('data:image'));
});
