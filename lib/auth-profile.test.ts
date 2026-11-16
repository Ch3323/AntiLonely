import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapGoogleProfileToUser,
  prepareUserUpdatePayload,
} from './auth-profile.ts';

describe('auth profile helpers', () => {
  it('keeps nothing from the Google profile: the nickname starts as the generated username and there is no photo', () => {
    assert.deepEqual(mapGoogleProfileToUser('user_abc123'), {
      name: 'user_abc123',
      username: 'user_abc123',
      displayUsername: 'user_abc123',
      image: undefined,
    });
  });

  it('clears displayUsername when updating nickname only, leaving explicit displayUsername updates intact', () => {
    assert.deepEqual(prepareUserUpdatePayload({ name: 'ต้นหอม' }), {
      data: { name: 'ต้นหอม', displayUsername: null },
    });

    assert.equal(prepareUserUpdatePayload({ image: 'data:image/jpeg;base64,...' }), undefined);

    assert.equal(
      prepareUserUpdatePayload({
        name: 'ต้นหอม',
        displayUsername: 'custom_handle',
      }),
      undefined
    );
  });
});
