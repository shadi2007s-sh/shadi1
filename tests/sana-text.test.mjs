// Run: node --test tests/sana-text.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sana-text.js', import.meta.url), 'utf8');
const { accept, norm, spellNorm, buildAzureSSML } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Arabic normalization preserves equivalent letter forms', () => {
  assert.equal(norm('إِيمَان'), norm('ايمان'));
});
test('correct word is accepted', () => {
  assert.equal(accept('مدرسة', 'مدرسة'), true);
});
test('extra speech containing target is not accepted', () => {
  assert.equal(accept('هذه مدرسة جميلة', 'مدرسة'), false);
});
test('different short words are rejected', () => {
  assert.equal(accept('بيت', 'بنت'), false);
  assert.equal(accept('نور', 'نار'), false);
});
test('missing or empty answer is rejected', () => {
  assert.equal(accept('', 'مدرسة'), false);
  assert.equal(accept('مدرسة', ''), false);
});
test('minor transcription difference in long word is tolerated', () => {
  assert.equal(accept('المكتبه', 'المكتبة'), true);
});
test('dictation ignores vowel marks by default', () => {
  assert.equal(spellNorm('كَتَبَ'), spellNorm('كتب'));
});
test('SSML escapes markup and quotes', () => {
  const ssml = buildAzureSSML('قال: "أهلاً" & <مرحبا>');
  assert.ok(ssml.includes('&quot;'));
  assert.ok(ssml.includes('&amp;'));
  assert.ok(ssml.includes('&lt;'));
  assert.ok(ssml.includes('&gt;'));
});
