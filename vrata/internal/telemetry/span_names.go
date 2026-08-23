package telemetry

import (
	"context"
	"regexp"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// The Docker Engine SDK instruments its own HTTP calls through the global
// tracer this package installs, which is what lets a Tefter or Pristaniste request be
// followed all the way down to the individual container operations it triggers.
// The catch is that the SDK names those spans after the raw request path, so a
// single logical operation like "inspect a container" shows up under hundreds
// of distinct names:
//
//	GET /v1.51/containers/<64-hex-id>/json
//
// Unbounded span names make the trace view unreadable and blow up cardinality
// in any grouping by name. These patterns fold the volatile parts back into a
// template, turning the example above into:
//
//	GET /containers/{id}/json
var (
	// The negotiated API version prefix, e.g. /v1.51, carries no meaning for a
	// reader and only splits otherwise-identical operations apart.
	dockerAPIVersionRe = regexp.MustCompile(`/v[0-9]+\.[0-9]+`)

	// The id or name that follows a collection, when it is itself followed by
	// a sub-path (an action or sub-resource). The trailing segment requirement
	// is what keeps list and create endpoints (/containers/json,
	// /containers/create) from being mistaken for an id.
	dockerCollectionIDRe = regexp.MustCompile(
		`(/(?:containers|images|volumes|networks|exec|services|tasks|secrets|configs|nodes|plugins)/)[^/]+(/)`)

	// A bare hex id sitting at the end of a path (e.g. an exec or image id with
	// no trailing action), which the rule above does not reach.
	dockerTrailingHexRe = regexp.MustCompile(`/[0-9a-f]{12,}$`)
)

// normalizeSpanName collapses the volatile parts of a Docker Engine API span
// name into a template. It leaves any name that does not look like a Docker
// API call untouched, so the services' own server spans (already clean route
// templates like "GET /api/v1/instances/{name}") pass through unchanged.
func normalizeSpanName(name string) string {
	// Cheap guard: only Docker SDK spans carry the version prefix or one of the
	// engine collections. Server spans have neither, so they are never touched.
	if !dockerAPIVersionRe.MatchString(name) && !dockerCollectionIDRe.MatchString(name) {
		return name
	}

	name = dockerAPIVersionRe.ReplaceAllString(name, "")
	name = dockerCollectionIDRe.ReplaceAllString(name, "${1}{id}${2}")
	name = dockerTrailingHexRe.ReplaceAllString(name, "/{id}")
	return name
}

// spanNameNormalizer is a SpanProcessor that rewrites a span's name as it
// starts, before it is exported. Renaming at start is safe because the Docker
// SDK sets the name at creation and never changes it afterwards.
type spanNameNormalizer struct{}

func (spanNameNormalizer) OnStart(_ context.Context, s sdktrace.ReadWriteSpan) {
	if normalized := normalizeSpanName(s.Name()); normalized != s.Name() {
		s.SetName(normalized)
	}
}

func (spanNameNormalizer) OnEnd(sdktrace.ReadOnlySpan)      {}
func (spanNameNormalizer) Shutdown(context.Context) error   { return nil }
func (spanNameNormalizer) ForceFlush(context.Context) error { return nil }

var _ sdktrace.SpanProcessor = spanNameNormalizer{}
