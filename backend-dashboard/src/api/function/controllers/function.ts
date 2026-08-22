/**
 * Function controller
 * Handles HTTP requests for function operations
 */

import { getClickHouseClient } from "../../../telemetry/clickhouse";
import { functionInvocationLogs } from "../../../telemetry/queries";

export default ({ strapi }: { strapi: any }) => ({
  /**
   * Resolve function by numeric id or documentId
   */
  async resolveFunction(idOrDocumentId: string) {
    if (/^\d+$/.test(idOrDocumentId)) {
      const byId = await strapi.entityService.findOne(
        "api::function.function",
        Number(idOrDocumentId),
        {
          populate: ["owner"],
        },
      );

      if (byId) {
        return byId;
      }
    }

    const byDocumentId = await strapi.entityService.findMany(
      "api::function.function",
      {
        filters: { documentId: idOrDocumentId },
        populate: ["owner"],
        limit: 1,
      },
    );

    return byDocumentId?.[0] || null;
  },

  /**
   * Find all functions for the current user
   */
  async find(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { page = 1, pageSize = 25, search, runtime, status } = ctx.query;

    try {
      const functions = await strapi
        .service("api::function.function")
        .findByOwner(user.id, {
          page: Number(page),
          pageSize: Number(pageSize),
          search: search ? String(search) : undefined,
          runtime: runtime ? String(runtime) : undefined,
          status: status ? String(status) : undefined,
        });

      const total = await strapi
        .service("api::function.function")
        .countByOwner(user.id, {
          search: search ? String(search) : undefined,
          runtime: runtime ? String(runtime) : undefined,
          status: status ? String(status) : undefined,
        });

      return {
        data: functions,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            total,
            pageCount: Math.ceil(total / Number(pageSize)),
          },
        },
      };
    } catch (error) {
      strapi.log.error("Error finding functions:", error);
      return ctx.badRequest("Failed to fetch functions");
    }
  },

  /**
   * Find one function by ID
   */
  async findOne(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { id } = ctx.params;

    try {
      const fn = await strapi
        .controller("api::function.function")
        .resolveFunction(String(id));

      if (!fn) {
        return ctx.notFound("Function not found");
      }

      // Check ownership
      if (fn.owner?.id !== user.id) {
        return ctx.forbidden("You do not have access to this function");
      }

      return { data: fn };
    } catch (error) {
      strapi.log.error("Error finding function:", error);
      return ctx.badRequest("Failed to fetch function");
    }
  },

  /**
   * Find function by name
   */
  async findByName(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { name } = ctx.params;

    try {
      const fn = await strapi
        .service("api::function.function")
        .findByName(name);

      if (!fn) {
        return ctx.notFound("Function not found");
      }

      // Populate owner for access check
      const fnWithOwner = await strapi.entityService.findOne(
        "api::function.function",
        fn.id,
        {
          populate: ["owner"],
        },
      );

      // Check ownership
      if (fnWithOwner?.owner?.id !== user.id) {
        return ctx.forbidden("You do not have access to this function");
      }

      return { data: fnWithOwner };
    } catch (error) {
      strapi.log.error("Error finding function by name:", error);
      return ctx.badRequest("Failed to fetch function");
    }
  },

  /**
   * Create a new function
   */
  async create(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const payload = ctx.request.body?.data ?? ctx.request.body ?? {};
    const {
      name,
      description,
      runtime,
      handler,
      code,
      memoryMB,
      timeoutSec,
      environment,
      tags,
    } = payload;

    // Validate required fields
    if (!name || !runtime || !handler) {
      return ctx.badRequest("Name, runtime, and handler are required");
    }

    // Validate name format
    if (
      !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) ||
      name.length < 2 ||
      name.length > 63
    ) {
      return ctx.badRequest(
        "Name must be 2-63 characters, lowercase alphanumeric with hyphens",
      );
    }

    // Check quota
    const currentCount = await strapi
      .service("api::function.function")
      .countByOwner(user.id);
    const maxFunctions = user.quotas?.maxFunctions || 10;
    if (currentCount >= maxFunctions) {
      return ctx.forbidden(
        `You have reached your function quota (${maxFunctions})`,
      );
    }

    // Check if name already exists
    const existing = await strapi
      .service("api::function.function")
      .findByName(name);
    if (existing) {
      return ctx.badRequest("A function with this name already exists");
    }

    try {
      const fn = await strapi.service("api::function.function").createWithSync({
        name,
        description,
        runtime,
        handler,
        code,
        memoryMB,
        timeoutSec,
        environment,
        tags,
        owner: user.id,
      });

      return { data: fn };
    } catch (error) {
      strapi.log.error("Error creating function:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to create function",
      );
    }
  },

  /**
   * Update a function
   */
  async update(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { id } = ctx.params;
    const payload = ctx.request.body?.data ?? ctx.request.body ?? {};
    const {
      description,
      runtime,
      handler,
      code,
      memoryMB,
      timeoutSec,
      environment,
      tags,
      status,
    } = payload;

    // Check ownership
    const existing = await strapi
      .controller("api::function.function")
      .resolveFunction(String(id));

    if (!existing) {
      return ctx.notFound("Function not found");
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden("You do not have access to this function");
    }

    try {
      const fn = await strapi
        .service("api::function.function")
        .updateWithSync(
          existing.id,
          {
            description,
            runtime,
            handler,
            code,
            memoryMB,
            timeoutSec,
            environment,
            tags,
            status,
          },
          user.id,
        );

      return { data: fn };
    } catch (error) {
      strapi.log.error("Error updating function:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to update function",
      );
    }
  },

  /**
   * Delete a function
   */
  async delete(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { id } = ctx.params;

    // Check ownership
    const existing = await strapi
      .controller("api::function.function")
      .resolveFunction(String(id));

    if (!existing) {
      return ctx.notFound("Function not found");
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden("You do not have access to this function");
    }

    try {
      await strapi
        .service("api::function.function")
        .deleteWithSync(existing.id, user.id);
      return { data: { success: true, name: existing.name } };
    } catch (error) {
      strapi.log.error("Error deleting function:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to delete function",
      );
    }
  },

  /**
   * Invoke a function
   */
  async invoke(ctx: any) {
    const user = ctx.state.user;

    const { id } = ctx.params;
    const payload = ctx.request.body || {};
    const { local } = ctx.query;
    const localOverride =
      typeof local === "string"
        ? ["1", "true", "yes", "on"].includes(local.trim().toLowerCase())
        : undefined;

    // Check ownership
    const existing = await strapi
      .controller("api::function.function")
      .resolveFunction(String(id));

    if (!existing) {
      return ctx.notFound("Function not found");
    }

    if (user && existing.owner?.id !== user.id) {
      return ctx.forbidden("You do not have access to this function");
    }

    if (existing.status === "inactive") {
      return ctx.forbidden(
        "Function is inactive. Activate it before invoking.",
      );
    }

    try {
      const result = await strapi
        .service("api::function.function")
        .invoke(existing.id, payload, user?.id, { local: localOverride });

      return {
        data: result.body,
        meta: {
          statusCode: result.statusCode,
        },
      };
    } catch (error) {
      strapi.log.error("Error invoking function:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to invoke function",
      );
    }
  },

  /**
   * Receive invocation report from Impuls
   */
  async invocationReport(ctx: any) {
    const configuredSecret = process.env.IMPULS_REPORT_SECRET;
    const providedSecret = ctx.request.headers["x-impuls-report-secret"];

    if (configuredSecret && providedSecret !== configuredSecret) {
      return ctx.unauthorized("Invalid report secret");
    }

    const payload = ctx.request.body ?? {};
    const {
      functionName,
      status,
      providerStatusCode,
      executionTimeMs,
      runtimeLogs,
      response,
      errorMessage,
      memoryUsedMb,
      local,
      invokedAt,
    } = payload;

    if (!functionName || (status !== "success" && status !== "failure")) {
      return ctx.badRequest("functionName and valid status are required");
    }

    try {
      await strapi.service("api::function.function").recordInvocationReport({
        functionName: String(functionName),
        status,
        providerStatusCode:
          typeof providerStatusCode === "number"
            ? providerStatusCode
            : undefined,
        executionTimeMs:
          typeof executionTimeMs === "number" ? executionTimeMs : undefined,
        runtimeLogs:
          runtimeLogs && typeof runtimeLogs === "object"
            ? runtimeLogs
            : undefined,
        response,
        errorMessage:
          typeof errorMessage === "string" ? errorMessage : undefined,
        memoryUsedMb:
          typeof memoryUsedMb === "number" ? memoryUsedMb : undefined,
        local: Boolean(local),
        invokedAt: typeof invokedAt === "string" ? invokedAt : undefined,
      });

      return { data: { success: true } };
    } catch (error) {
      strapi.log.error("Error recording invocation report:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to record invocation report",
      );
    }
  },

  /**
   * Get function invocation logs
   */
  async logs(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be logged in");
    }

    const { id } = ctx.params;
    const requestedLimit = Number(ctx.query.limit) || 25;

    const existing = await strapi
      .controller("api::function.function")
      .resolveFunction(String(id));

    if (!existing) {
      return ctx.notFound("Function not found");
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden("You do not have access to this function");
    }

    // Invocation history lives in the telemetry store now, not in Strapi.
    const ch = getClickHouseClient();
    if (!ch) {
      return ctx.send(
        {
          error: {
            status: 503,
            name: "TelemetryUnconfigured",
            message:
              "Invocation history requires the telemetry store. Set CLICKHOUSE_URL to enable it.",
          },
        },
        503,
      );
    }

    try {
      // Invocation history is only meaningful inside the telemetry retention
      // window, so the lookback is bounded rather than unbounded.
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      return await functionInvocationLogs(
        ch,
        { from, to },
        {
          userId: user.id,
          resourceIds: [String(existing.id), String(existing.documentId)],
          limit: requestedLimit,
        },
      );
    } catch (error) {
      strapi.log.error("Error fetching function logs:", error);
      return ctx.badRequest(
        (error as Error).message || "Failed to fetch function logs",
      );
    }
  },
});
