import { Elysia, t } from "elysia";
import { enforceAuthenticatedContext, resolveAuthenticatedContext } from "../auth";
import { db } from "../../schema/db";
import { adSettings } from "../../schema/ad_settings.schema";
import { eq, and } from "drizzle-orm";
import { success } from "../../utils/response";

export const adRoutes = new Elysia({ prefix: "/ads" })
  .resolve(resolveAuthenticatedContext)
  .onBeforeHandle(enforceAuthenticatedContext)
  .get("/", async ({ userId }) => {
    const allSettings = await db.query.adSettings.findMany({
      where: eq(adSettings.userId, userId!),
    });
    return success(allSettings);
  })
  .post("/", async ({ body, userId }) => {
    const existing = await db.query.adSettings.findFirst({
      where: and(
        eq(adSettings.userId, userId!),
        eq(adSettings.provider, body.provider)
      ),
    });
    
    if (existing) {
      const result = await db.update(adSettings)
        .set({
          adType: body.adType,
          adCode: body.adCode,
          isActive: body.isActive,
          updatedAt: new Date()
        })
        .where(eq(adSettings.id, existing.id))
        .returning();
      return success(result[0]);
    } else {
      const result = await db.insert(adSettings)
        .values({
          userId: userId!,
          provider: body.provider,
          adType: body.adType,
          adCode: body.adCode,
          isActive: body.isActive,
        })
        .returning();
      return success(result[0]);
    }
  }, {
    body: t.Object({
      provider: t.String(),
      adType: t.String(),
      adCode: t.String(),
      isActive: t.Boolean(),
    })
  });
