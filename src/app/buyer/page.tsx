import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function BuyerLanding() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-8 py-16">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">
        Aretheon Datasets
      </h1>
      <p className="text-fg-muted">
        Hallo {session.user.name}. Der Buyer-Bereich wird in einem späteren
        Schritt freigeschaltet.
      </p>
    </div>
  );
}
