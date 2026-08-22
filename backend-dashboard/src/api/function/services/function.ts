/**
 * Function service
 * Handles business logic for function operations with Impuls sync
 */

import { createImpulsClient, ImpulsClient } from "./impuls-client";

import { recordAudit } from "../../../telemetry/audit";
/**
 * Get configured Impuls client
 */
function getImpulsClient(): ImpulsClient {
  const baseUrl = process.env.IMPULS_URL || "http://localhost:8080";
  const apiKey = process.env.IMPULS_API_KEY;

  return createImpulsClient({
    baseUrl,
    apiKey,
    timeout: 30000,
    retries: 3,
  });
}

export default ({ strapi }: { strapi: any }) => ({
  /**
   * Create function with Impuls sync
   */
  async createWithSync(data: {
    name: string;
    description?: string;
    runtime: string;
    handler: string;
    code?: string;
    memoryMB?: number;
    timeoutSec?: number;
    environment?: Record<string, string>;
    tags?: string[];
    owner: number;
  }) {
    const impulsClient = getImpulsClient();

    // Create function in Impuls
    let impulsFunction;
    try {
      impulsFunction = await impulsClient.createFunction({
        name: data.name,
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        code: data.code || "",
        memory_mb: data.memoryMB || 128,
        timeout_sec: data.timeoutSec || 30,
        environment: data.environment,
      });
    } catch (error) {
      strapi.log.error("Failed to create function in Impuls:", error);
      throw new Error(
        `Failed to create function in Impuls: ${(error as Error).message}`,
      );
    }

    // Create function record in Strapi
    const functionRecord = await strapi.entityService.create(
      "api::function.function",
      {
        data: {
          name: data.name,
          description: data.description,
          runtime: data.runtime,
          handler: data.handler,
          code: data.code,
          memoryMB: data.memoryMB || 128,
          timeoutSec: data.timeoutSec || 30,
          environment: data.environment || {},
          externalId: impulsFunction.id,
          status: "active",
          owner: data.owner,
          invocationCount: "0",
          tags: data.tags || [],
        },
      },
    );

    // Log activity
    recordAudit({
      action: "function.create",
      resourceType: "function",
      resourceId: String(functionRecord.documentId),
      resourceName: data.name,
      status: "success",
      userId: data.owner,
    });

    return functionRecord;
  },

  /**
   * Update function with Impuls sync
   */
  async updateWithSync(
    documentId: string | number,
    data: {
      description?: string;
      runtime?: string;
      handler?: string;
      code?: string;
      memoryMB?: number;
      timeoutSec?: number;
      environment?: Record<string, string>;
      tags?: string[];
      status?: "active" | "inactive" | "error" | "deploying";
    },
    userId: number,
  ) {
    // Get existing function
    const existing = await strapi.entityService.findOne(
      "api::function.function",
      documentId,
    );
    if (!existing) {
      throw new Error("Function not found");
    }

    const impulsClient = getImpulsClient();

    // Update in Impuls
    try {
      await impulsClient.updateFunction(existing.name, {
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        code: data.code,
        memory_mb: data.memoryMB,
        timeout_sec: data.timeoutSec,
        status: data.status,
        environment: data.environment,
      });
    } catch (error) {
      strapi.log.error("Failed to update function in Impuls:", error);
      throw new Error(
        `Failed to update function in Impuls: ${(error as Error).message}`,
      );
    }

    // Update in Strapi
    const updated = await strapi.entityService.update(
      "api::function.function",
      documentId,
      {
        data: {
          ...data,
        } as any,
      },
    );

    // Log activity
    recordAudit({
      action: "function.update",
      resourceType: "function",
      resourceId: String(documentId),
      resourceName: existing.name,
      status: "success",
      userId: userId,
      details: { updatedFields: Object.keys(data) },
    });

    return updated;
  },

  /**
   * Delete function with Impuls sync
   */
  async deleteWithSync(documentId: string | number, userId: number) {
    // Get existing function
    const existing = await strapi.entityService.findOne(
      "api::function.function",
      documentId,
    );
    if (!existing) {
      throw new Error("Function not found");
    }

    const impulsClient = getImpulsClient();

    // Delete from Impuls
    try {
      await impulsClient.deleteFunction(existing.name);
    } catch (error) {
      strapi.log.error("Failed to delete function in Impuls:", error);
      // Continue with deletion in Strapi even if Impuls fails
    }

    // Delete from Strapi
    await strapi.entityService.delete("api::function.function", documentId);

    // Log activity
    recordAudit({
      action: "function.delete",
      resourceType: "function",
      resourceId: String(documentId),
      resourceName: existing.name,
      status: "success",
      userId: userId,
    });

    return { success: true, name: existing.name };
  },

  /**
   * Invoke function
   */
  async invoke(
    documentId: string | number,
    payload: Record<string, unknown>,
    userId?: number,
    options: { local?: boolean } = {},
  ) {
    // Get function
    const fn = await strapi.entityService.findOne(
      "api::function.function",
      documentId,
    );
    if (!fn) {
      throw new Error("Function not found");
    }

    if (fn.status === "inactive") {
      throw new Error("Function is inactive. Activate it before invoking.");
    }

    const impulsClient = getImpulsClient();
    const invokeLocal =
      options.local ?? process.env.IMPULS_LOCAL_INVOKE_DEFAULT === "true";

    // Invoke in Impuls
    let result;
    try {
      result = await impulsClient.invokeFunction(fn.name, {
        payload,
        local: invokeLocal,
      });
    } catch (error) {
      const message = (error as Error).message || "";

      // Some Impuls/runtime paths may return malformed headers; retry once in local mode.
      if (
        !invokeLocal &&
        /invalid header value char|parse error/i.test(message)
      ) {
        result = await impulsClient.invokeFunction(fn.name, {
          payload,
          local: true,
        });
      } else {
        throw new Error(`Function invocation failed: ${message}`);
      }
    }

    const rawBody = result.body as any;

    // Backward compatibility: older Impuls versions return an envelope
    // { status_code, body, duration_ms, logs, ... } as JSON payload.
    if (
      rawBody &&
      typeof rawBody === "object" &&
      "status_code" in rawBody &&
      "body" in rawBody
    ) {
      return {
        statusCode: Number(rawBody.status_code) || result.status_code,
        body: rawBody.body,
      };
    }

    return {
      statusCode: result.status_code,
      body: rawBody,
    };
  },

  /**
   * Record invocation report pushed by Impuls
   */
  async recordInvocationReport(report: {
    functionName: string;
    status: "success" | "failure";
    providerStatusCode?: number;
    executionTimeMs?: number;
    runtimeLogs?: { stdout?: string[]; stderr?: string[] };
    response?: unknown;
    errorMessage?: string;
    memoryUsedMb?: number;
    local?: boolean;
    invokedAt?: string;
  }) {
    const target = await strapi
      .service("api::function.function")
      .findByName(report.functionName);
    if (!target) {
      strapi.log.warn(
        `Invocation report ignored: function not found (${report.functionName})`,
      );
      return { success: false, reason: "function_not_found" };
    }

    const targetWithOwner = await strapi.entityService.findOne(
      "api::function.function",
      target.id,
      {
        populate: ["owner"],
      },
    );

    const currentCount = BigInt(
      targetWithOwner?.invocationCount || target.invocationCount || "0",
    );
    await strapi.entityService.update("api::function.function", target.id, {
      data: {
        invocationCount: (currentCount + 1n).toString(),
        lastInvokedAt: report.invokedAt || new Date().toISOString(),
      } as any,
    });

    recordAudit({
      action: "function.invoke",
      resourceType: "function",
      resourceId: String(target.documentId || target.id),
      resourceName: target.name,
      status: report.status,
      ...(targetWithOwner?.owner?.id
        ? { userId: targetWithOwner.owner.id }
        : {}),
      errorMessage: report.errorMessage,
      details: {
        executionTimeMs: report.executionTimeMs,
        providerStatusCode: report.providerStatusCode,
        runtimeLogs: report.runtimeLogs || null,
        functionResponse: report.response,
        memoryUsedMb: report.memoryUsedMb,
        local: report.local === true,
        source: "impuls-report",
      },
    });

    return { success: true };
  },

  /**
   * Find functions by owner
   */
  async findByOwner(
    ownerId: number,
    params: {
      page?: number;
      pageSize?: number;
      search?: string;
      runtime?: string;
      status?: string;
    } = {},
  ) {
    const { page = 1, pageSize = 25, search, runtime, status } = params;

    const filters: Record<string, unknown> = { owner: ownerId };

    if (search) {
      filters.$or = [
        { name: { $containsi: search } },
        { description: { $containsi: search } },
      ];
    }

    if (runtime) {
      filters.runtime = runtime;
    }

    if (status) {
      filters.status = status;
    }

    return strapi.entityService.findMany("api::function.function", {
      filters,
      sort: { createdAt: "desc" },
      populate: ["owner"],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  },

  /**
   * Count functions by owner
   */
  async countByOwner(
    ownerId: number,
    params: { search?: string; runtime?: string; status?: string } = {},
  ) {
    const { search, runtime, status } = params;

    const where: Record<string, unknown> = { owner: ownerId };

    if (search) {
      where.$or = [
        { name: { $containsi: search } },
        { description: { $containsi: search } },
      ];
    }

    if (runtime) {
      where.runtime = runtime;
    }

    if (status) {
      where.status = status;
    }

    const result = await strapi.db.query("api::function.function").count({
      where,
    });
    return result;
  },

  /**
   * Find function by name
   */
  async findByName(name: string) {
    const results = await strapi.entityService.findMany(
      "api::function.function",
      {
        filters: { name },
        limit: 1,
      },
    );
    return (results as any[])?.[0] || null;
  },
});
