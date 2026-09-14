import { ApiDocs } from "@/components/aurevia/api-docs";

// ---------------------------------------------------------------------------
// Aurevia interactive API docs route (Issue #119).
//
// `/api-docs` renders the Scalar API reference widget, backed by the spec
// served at `/api/v1/openapi`. `force-dynamic` because the spec is generated
// per-request and we never want a stale copy baked into the static export.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default function ApiDocsPage() {
  return <ApiDocs />;
}
