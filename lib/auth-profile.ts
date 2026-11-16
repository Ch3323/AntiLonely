export interface GoogleProfileNameFields {
  name?: string | null;
  given_name?: string | null;
}

/**
 * Maps a first-time Google OAuth profile to Better Auth's user record, keeping
 * the Google account's name as the visible nickname while keeping the generated
 * username handle anonymous and stripping the external avatar.
 */
export function mapGoogleProfileToUser(
  profile: GoogleProfileNameFields,
  generatedUsername: string
) {
  const name =
    profile.name?.trim() || profile.given_name?.trim() || generatedUsername;
  return {
    name,
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
