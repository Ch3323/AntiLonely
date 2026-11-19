"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth/auth-client";

// On the full log in and sign up pages: someone who is already signed in has
// nothing to do there, so they go to the home page. The form shows straight
// away rather than waiting on this check.
export default function SignedInRedirect() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session);

  useEffect(() => {
    if (signedIn) router.replace("/");
  }, [signedIn, router]);

  return null;
}
