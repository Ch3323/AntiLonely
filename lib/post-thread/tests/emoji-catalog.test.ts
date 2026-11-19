import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOJI_CATALOG,
  QUICK_REACTIONS,
  getEmojiItem,
  getEmojiLabel,
} from '../emoji-catalog.ts';

describe('emoji-catalog', () => {
  it('contains culturally accurate Thai labels and valid hex values', () => {
    assert.equal(getEmojiItem('😣')?.hex, '1f623');
    assert.equal(getEmojiLabel('😣'), 'ปวดใจ');
    assert.equal(getEmojiLabel('😭'), 'ร้องไห้หนักมาก');
    assert.equal(getEmojiLabel('🥹'), 'ซาบซึ้ง');
    assert.equal(getEmojiLabel('❤️'), 'หัวใจ');
    assert.equal(getEmojiLabel('👍'), 'ถูกใจ');
  });

  it('quick reactions include primary sad/empathy emojis for room context', () => {
    assert.deepEqual(QUICK_REACTIONS, ['😭', '🥹', '😢', '😣', '😂', '👍']);
    for (const char of QUICK_REACTIONS) {
      assert.ok(EMOJI_CATALOG[char], `Missing catalog entry for quick reaction ${char}`);
    }
  });
});
