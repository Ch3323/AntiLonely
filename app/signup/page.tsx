import SignupForm from "@/component/auth/SignupForm";
import SignedInRedirect from "@/component/auth/SignedInRedirect";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <SignedInRedirect />
      <SignupForm />
    </main>
  );
}
