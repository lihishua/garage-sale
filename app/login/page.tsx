import { Suspense } from "react";
import LoginForm from "./LoginForm";

// the form reads ?mode=signup, and useSearchParams() has to sit behind a
// suspense boundary or the whole page fails to prerender
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="gs-auth" />}>
      <LoginForm />
    </Suspense>
  );
}
