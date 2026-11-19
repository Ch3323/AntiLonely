// The email someone just signed up with (or tried to log in with before
// verifying it), kept for this browser tab so the "check your email" page can
// say where the link went and send it again. It never goes in a URL.
const KEY = "antilonely:pending-email";

export function rememberPendingEmail(email: string) {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // Storage blocked: the page asks for the email instead.
  }
}

export function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetPendingEmail() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
