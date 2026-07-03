import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=1`);
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl shadow-black/5">
        <div className="mb-1 text-xl font-bold tracking-tight">
          <span className="text-foreground">Auto</span>
          <span className="text-accent">gent</span>
        </div>
        <p className="mb-6 text-sm text-muted">
          Войдите, чтобы продолжить
        </p>

        <form action={loginAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="you@autogentgroup.ru"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-danger">
              Неверный email или пароль
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-full bg-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
