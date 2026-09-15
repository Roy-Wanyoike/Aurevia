import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import {
  slugify,
  ensureUniqueCategorySlug,
} from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/blog/categories
//
// Returns categories ordered by name. Includes a `count` of published
// articles per category so the sidebar can show the number alongside each
// entry. The `color` field is the accent used in chips, dashboard charts,
// and the article header.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-categories-list";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const categories = await db.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            articles: { where: { status: "PUBLISHED" } },
          },
        },
      },
    });

    const out = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      color: c.color,
      count: c._count.articles,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ categories: out, total: out.length });
  } catch (e: any) {
    logger.error("Blog categories list failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/blog/categories
// Body: { name, description?, color?, slug? }
//
// Creates a new category. The slug is auto-derived from the name when not
// provided, and uniquified on collision.
// ---------------------------------------------------------------------------

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "color must be a #rrggbb hex string")
    .optional(),
  slug: z.string().optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-category-create";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #130 / BE-003 / SEC-001 — require trader+ to create categories.
  const role = await requireRole(req, "trader");
  if (!role.ok) return role.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const slug = await ensureUniqueCategorySlug(slugify(data.slug ?? data.name));

    const category = await db.category.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description ?? null,
        color: data.color ?? "#10b981",
      },
    });

    logger.info("Blog category created", { requestId, slug });

    return NextResponse.json(
      {
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          color: category.color,
          count: 0,
          createdAt: category.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e: any) {
    logger.error("Blog category create failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
