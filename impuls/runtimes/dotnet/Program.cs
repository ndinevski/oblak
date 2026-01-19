/*
 * Impuls Function Runtime - .NET
 *
 * This is the runtime that executes inside the Firecracker VM.
 * It receives function invocations via HTTP and executes the handler.
 */

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

var port = int.Parse(Environment.GetEnvironmentVariable("RUNTIME_PORT") ?? "8080");
var functionDir = Environment.GetEnvironmentVariable("FUNCTION_DIR") ?? "/var/task";

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Cached compilation
Assembly? cachedAssembly = null;
string? cachedCode = null;
object? cachedHandler = null;
MethodInfo? cachedMethod = null;

app.MapGet("/health", () => Results.Json(new { status = "healthy", runtime = "dotnet" }));

app.MapPost("/invoke", async (HttpContext context) =>
{
    try
    {
        var request = await JsonSerializer.DeserializeAsync<InvocationRequest>(context.Request.Body);
        if (request == null)
        {
            return Results.Json(new { statusCode = 500, error = "Invalid request" });
        }

        // Set environment variables
        if (request.Env != null)
        {
            foreach (var (key, value) in request.Env)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }

        // Load and compile the function if needed
        if (cachedCode != request.Code || cachedAssembly == null)
        {
            var (assembly, error) = CompileCode(request.Code ?? "");
            if (assembly == null)
            {
                return Results.Json(new { statusCode = 500, error = $"Compilation failed: {error}" });
            }
            cachedAssembly = assembly;
            cachedCode = request.Code;
            cachedHandler = null;
            cachedMethod = null;
        }

        // Find the handler
        if (cachedHandler == null || cachedMethod == null)
        {
            var handlerParts = (request.Handler ?? "Function.Handler").Split('.');
            if (handlerParts.Length < 2)
            {
                return Results.Json(new { statusCode = 500, error = "Invalid handler format" });
            }

            var className = string.Join(".", handlerParts[..^1]);
            var methodName = handlerParts[^1];

            var type = cachedAssembly.GetType(className);
            if (type == null)
            {
                return Results.Json(new { statusCode = 500, error = $"Class '{className}' not found" });
            }

            cachedHandler = Activator.CreateInstance(type);
            cachedMethod = type.GetMethod(methodName);
            if (cachedMethod == null)
            {
                return Results.Json(new { statusCode = 500, error = $"Method '{methodName}' not found" });
            }
        }

        // Create context
        var lambdaContext = new LambdaContext
        {
            FunctionName = request.FunctionName ?? "unknown",
            MemoryLimitInMB = request.MemoryMb ?? 128,
            RemainingTime = TimeSpan.FromSeconds(request.TimeoutSec ?? 30)
        };

        // Execute the handler
        object? result;
        var parameters = cachedMethod.GetParameters();
        
        if (parameters.Length == 0)
        {
            result = cachedMethod.Invoke(cachedHandler, null);
        }
        else if (parameters.Length == 1)
        {
            result = cachedMethod.Invoke(cachedHandler, new object?[] { request.Event });
        }
        else
        {
            result = cachedMethod.Invoke(cachedHandler, new object?[] { request.Event, lambdaContext });
        }

        // Handle async methods
        if (result is Task task)
        {
            await task;
            var resultProperty = task.GetType().GetProperty("Result");
            result = resultProperty?.GetValue(task);
        }

        return Results.Json(new { statusCode = 200, body = result });
    }
    catch (Exception ex)
    {
        return Results.Json(new 
        { 
            statusCode = 500, 
            error = ex.Message,
            stack = ex.StackTrace
        });
    }
});

app.Run();

static (Assembly?, string?) CompileCode(string code)
{
    var syntaxTree = CSharpSyntaxTree.ParseText(code);

    // Add references
    var references = new List<MetadataReference>
    {
        MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
        MetadataReference.CreateFromFile(typeof(Console).Assembly.Location),
        MetadataReference.CreateFromFile(typeof(Task).Assembly.Location),
        MetadataReference.CreateFromFile(typeof(JsonSerializer).Assembly.Location),
        MetadataReference.CreateFromFile(typeof(Enumerable).Assembly.Location),
        MetadataReference.CreateFromFile(Assembly.Load("System.Runtime").Location),
        MetadataReference.CreateFromFile(Assembly.Load("System.Collections").Location),
        MetadataReference.CreateFromFile(Assembly.Load("netstandard").Location),
    };

    var compilation = CSharpCompilation.Create(
        "FunctionAssembly",
        new[] { syntaxTree },
        references,
        new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

    using var ms = new MemoryStream();
    var emitResult = compilation.Emit(ms);

    if (!emitResult.Success)
    {
        var errors = string.Join("\n", emitResult.Diagnostics
            .Where(d => d.Severity == DiagnosticSeverity.Error)
            .Select(d => d.ToString()));
        return (null, errors);
    }

    ms.Seek(0, SeekOrigin.Begin);
    return (Assembly.Load(ms.ToArray()), null);
}

public class InvocationRequest
{
    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("handler")]
    public string? Handler { get; set; }

    [JsonPropertyName("event")]
    public JsonElement? Event { get; set; }

    [JsonPropertyName("env")]
    public Dictionary<string, string>? Env { get; set; }

    [JsonPropertyName("function_name")]
    public string? FunctionName { get; set; }

    [JsonPropertyName("memory_mb")]
    public int? MemoryMb { get; set; }

    [JsonPropertyName("timeout_sec")]
    public int? TimeoutSec { get; set; }
}

public class LambdaContext
{
    public string FunctionName { get; set; } = "";
    public string FunctionVersion { get; set; } = "1";
    public int MemoryLimitInMB { get; set; }
    public TimeSpan RemainingTime { get; set; }

    public int GetRemainingTimeInMillis() => (int)RemainingTime.TotalMilliseconds;
}
