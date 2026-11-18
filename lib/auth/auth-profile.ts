/**
 * The user record for someone signing up with Google for the first time.
 * This is an anonymous app, so nothing from the Google profile is kept: not
 * the account's name (usually a real name) and not its photo. The visible
 * nickname starts as the generated handle, and the person can change it on
 * their profile.
 */
export function mapGoogleProfileToUser(generatedUsername: string) {
  return {
    name: generatedUsername,
    username: generatedUsername,
    displayUsername: generatedUsername,
    image: undefined,
  };
}

/**
 * Clears any legacy/seeded `displayUsername` when a user updates their profile
 * nickname (`name`) directly without explicitly changing `displayUsername`, so
 * rooms and threads show the new nickname immediately.
 */
export function prepareUserUpdatePayload<T extends Record<string, unknown>>(
  user: T
): { data: T & { displayUsername: null } } | undefined {
  if (typeof user.name !== 'string' || 'displayUsername' in user) {
    return undefined;
  }
  return { data: { ...user, displayUsername: null } };
}
