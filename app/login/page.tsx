import LoginForm from "@/component/auth/LoginForm";
import SignedInRedirect from "@/component/auth/SignedInRedirect";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <SignedInRedirect />
      <LoginForm />
    </main>
  );
}
