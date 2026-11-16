import SignupForm from "@/component/SignupForm";
import SignedInRedirect from "@/component/SignedInRedirect";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <SignedInRedirect />
      <SignupForm />
    </main>
  );
}
