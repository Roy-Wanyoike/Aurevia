"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Aurevia interactive API docs (Issue #119).
//
// Loads the OpenAPI spec from `/api/v1/openapi` and renders it via the
// `@scalar/api-reference` browser bundle loaded from jsdelivr CDN. We pull
// the bundle dynamically (after the spec is in hand) so the rendered docs
// never flash empty for a frame — Scalar expects the `data-spec` attribute to
// be present at script-eval time, otherwise it falls back to a "no spec"
// state and the user has to refresh.
//
// No npm dependency, no build step, no SSR — this is a pure client component
// that mounts Scalar's reference widget into a div.
// ---------------------------------------------------------------------------

export function ApiDocs() {
  const [spec, setSpec] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/openapi")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSpec(data);
      })
      .catch(() => {
        if (!cancelled) setSpec({ error: "Failed to load OpenAPI spec" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Inject the Scalar CDN script once the spec is ready. Doing this via
  // createElement (rather than a JSX <script> tag) guarantees the browser
  // actually fetches + executes it — React does not execute inline <script>
  // children. The script reads `#apireference[data-spec]` on load and
  // bootstraps the reference UI into that element.
  useEffect(() => {
    if (!spec) return;
    if (document.getElementById("scalar-api-reference-script")) return;
    const script = document.createElement("script");
    script.id = "scalar-api-reference-script";
    script.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      // Leave the script in place — removing it does not un-mount Scalar's
      // rendered DOM and would just cause a re-fetch on next mount.
    };
  }, [spec]);

  if (!spec) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading API docs…
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div
        id="apireference"
        data-spec={JSON.stringify(spec)}
        style={{ height: "100vh" }}
      />
    </div>
  );
}
