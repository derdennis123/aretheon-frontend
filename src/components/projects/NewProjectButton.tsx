"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  function reset() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setLocation("");
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        setError(e.error ?? "Anlegen fehlgeschlagen");
        return;
      }
      const data = (await res.json()) as { project: { slug: string } };
      reset();
      setOpen(false);
      router.push(`/studio/${data.project.slug}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        Neues Projekt
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => !busy && setOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card-pad w-full max-w-md space-y-4"
          >
            <h3 className="text-base font-semibold">Neues Projekt anlegen</h3>

            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Bäckerei Müller München"
                required
                autoFocus
                maxLength={100}
              />
            </div>

            <div>
              <label className="label">Slug (URL-Pfad)</label>
              <input
                className="input font-mono text-xs"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                }}
                pattern="[a-z0-9-]+"
                minLength={2}
                maxLength={60}
                required
              />
              <p className="mt-1 text-xs text-fg-subtle">
                Wird in URLs und S3-Pfaden verwendet. Nur a-z, 0-9, &quot;-&quot;.
              </p>
            </div>

            <div>
              <label className="label">Standort (optional)</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z.B. München"
                maxLength={100}
              />
            </div>

            <div>
              <label className="label">Beschreibung (optional)</label>
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !name.trim() || !slug.trim()}
              >
                {busy ? "Anlege…" : "Anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
