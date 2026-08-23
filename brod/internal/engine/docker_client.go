package engine

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"

	"github.com/oblak/brod/internal/models"
)

// ManagedLabel marks every container Brod creates.
//
// Brod shares the host's Docker daemon with whatever else is running on it,
// including the rest of the Oblak platform. Listing and mutating only labelled
// containers means Brod can never stop Postgres or delete the telemetry
// collector because someone clicked the wrong row.
const ManagedLabel = "io.oblak.brod.managed"

// OwnerLabel records which Oblak user created the container.
const OwnerLabel = "io.oblak.brod.owner"

// DockerClient talks to a Docker daemon.
type DockerClient struct {
	cli      *client.Client
	registry string
}

// DockerConfig configures the engine connection.
type DockerConfig struct {
	// Host is a Docker endpoint such as unix:///var/run/docker.sock. Empty
	// uses the environment (DOCKER_HOST and friends).
	Host string
	// RegistryHost is prepended to bare image references so an image pushed to
	// Brod's own registry can be run by short name.
	RegistryHost string
}

// NewDockerClient connects to the Docker daemon.
func NewDockerClient(cfg DockerConfig) (*DockerClient, error) {
	opts := []client.Opt{
		// Negotiation keeps Brod working against older and newer daemons
		// rather than pinning one API version.
		client.WithAPIVersionNegotiation(),
	}
	if cfg.Host != "" {
		opts = append(opts, client.WithHost(cfg.Host))
	} else {
		opts = append(opts, client.FromEnv)
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("create docker client: %w", err)
	}

	return &DockerClient{cli: cli, registry: cfg.RegistryHost}, nil
}

// HealthCheck verifies the daemon is reachable.
func (d *DockerClient) HealthCheck(ctx context.Context) error {
	if _, err := d.cli.Ping(ctx); err != nil {
		return fmt.Errorf("%w: %v", models.ErrEngineUnavailable, err)
	}
	return nil
}

// Version reports the daemon version.
func (d *DockerClient) Version(ctx context.Context) (string, error) {
	v, err := d.cli.ServerVersion(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: %v", models.ErrEngineUnavailable, err)
	}
	return v.Version, nil
}

// Close releases the connection.
func (d *DockerClient) Close() error {
	return d.cli.Close()
}

// managedFilter restricts an operation to containers Brod created.
func managedFilter() filters.Args {
	f := filters.NewArgs()
	f.Add("label", ManagedLabel+"=true")
	return f
}

// ListContainers returns Brod-managed containers.
func (d *DockerClient) ListContainers(ctx context.Context, all bool) ([]models.Container, error) {
	list, err := d.cli.ContainerList(ctx, container.ListOptions{
		All:     all,
		Filters: managedFilter(),
	})
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}

	out := make([]models.Container, 0, len(list))
	for _, c := range list {
		out = append(out, summaryToContainer(c))
	}
	return out, nil
}

// GetContainer returns one container by id or name.
func (d *DockerClient) GetContainer(ctx context.Context, idOrName string) (*models.Container, error) {
	insp, err := d.cli.ContainerInspect(ctx, idOrName)
	if err != nil {
		if client.IsErrNotFound(err) {
			return nil, fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
		}
		return nil, fmt.Errorf("inspect container: %w", err)
	}

	// Refuse to expose containers Brod does not manage, so the API cannot be
	// used to inspect unrelated workloads on the host.
	if insp.Config == nil || insp.Config.Labels[ManagedLabel] != "true" {
		return nil, fmt.Errorf("%w: container %s", models.ErrNotFound, idOrName)
	}

	return inspectToContainer(insp), nil
}

// CreateContainer creates and optionally starts a container.
func (d *DockerClient) CreateContainer(ctx context.Context, req *models.CreateContainerRequest) (*models.Container, error) {
	reference := d.qualifyImage(req.Image)

	// The image must exist locally before a container can be created from it.
	// Pulling here rather than failing means a freshly pushed image just works.
	if err := d.PullImage(ctx, reference); err != nil {
		return nil, err
	}

	env := make([]string, 0, len(req.Env))
	for k, v := range req.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	labels := map[string]string{ManagedLabel: "true"}
	for k, v := range req.Labels {
		// Brod's own labels are applied last so a caller cannot spoof them.
		if k == ManagedLabel {
			continue
		}
		labels[k] = v
	}

	exposed := nat.PortSet{}
	bindings := nat.PortMap{}
	for _, p := range req.Ports {
		proto := p.Protocol
		if proto == "" {
			proto = "tcp"
		}
		port, err := nat.NewPort(proto, strconv.Itoa(p.ContainerPort))
		if err != nil {
			return nil, fmt.Errorf("invalid port %d/%s: %w", p.ContainerPort, proto, err)
		}
		exposed[port] = struct{}{}
		hostPort := ""
		if p.HostPort > 0 {
			hostPort = strconv.Itoa(p.HostPort)
		}
		bindings[port] = append(bindings[port], nat.PortBinding{
			HostIP:   "0.0.0.0",
			HostPort: hostPort,
		})
	}

	mounts := make([]string, 0, len(req.Volumes))
	for _, v := range req.Volumes {
		spec := fmt.Sprintf("%s:%s", v.Source, v.Target)
		if v.ReadOnly {
			spec += ":ro"
		}
		mounts = append(mounts, spec)
	}

	resources := container.Resources{}
	if req.MemoryLimit > 0 {
		resources.Memory = req.MemoryLimit
	}
	if req.CPULimit > 0 {
		// Docker expresses a fractional CPU as a quota over a 100ms period.
		resources.NanoCPUs = int64(req.CPULimit * 1e9)
	}

	created, err := d.cli.ContainerCreate(ctx,
		&container.Config{
			Image:        reference,
			Cmd:          req.Command,
			Env:          env,
			Labels:       labels,
			ExposedPorts: exposed,
		},
		&container.HostConfig{
			PortBindings:  bindings,
			Binds:         mounts,
			Resources:     resources,
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyMode(req.RestartPolicy)},
		},
		&network.NetworkingConfig{},
		nil,
		req.Name,
	)
	if err != nil {
		if strings.Contains(err.Error(), "Conflict") || strings.Contains(err.Error(), "already in use") {
			return nil, fmt.Errorf("%w: container %s", models.ErrAlreadyExists, req.Name)
		}
		return nil, fmt.Errorf("create container: %w", err)
	}

	if req.ShouldStart() {
		if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
			// Leave the created container in place: its logs are the only way
			// to find out why it would not start.
			return nil, fmt.Errorf("start container: %w", err)
		}
	}

	return d.GetContainer(ctx, created.ID)
}

// RemoveContainer deletes a container.
func (d *DockerClient) RemoveContainer(ctx context.Context, idOrName string, force bool) error {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return err
	}
	err := d.cli.ContainerRemove(ctx, idOrName, container.RemoveOptions{
		Force: force,
		// Anonymous volumes the container created are its own; leaving them
		// behind would leak disk on every delete.
		RemoveVolumes: true,
	})
	if err != nil {
		return fmt.Errorf("remove container: %w", err)
	}
	return nil
}

// StartContainer starts a stopped container.
func (d *DockerClient) StartContainer(ctx context.Context, idOrName string) error {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return err
	}
	if err := d.cli.ContainerStart(ctx, idOrName, container.StartOptions{}); err != nil {
		return fmt.Errorf("start container: %w", err)
	}
	return nil
}

// StopContainer stops a running container.
func (d *DockerClient) StopContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return err
	}
	if err := d.cli.ContainerStop(ctx, idOrName, container.StopOptions{Timeout: timeoutSeconds}); err != nil {
		return fmt.Errorf("stop container: %w", err)
	}
	return nil
}

// RestartContainer restarts a container.
func (d *DockerClient) RestartContainer(ctx context.Context, idOrName string, timeoutSeconds *int) error {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return err
	}
	if err := d.cli.ContainerRestart(ctx, idOrName, container.StopOptions{Timeout: timeoutSeconds}); err != nil {
		return fmt.Errorf("restart container: %w", err)
	}
	return nil
}

// ContainerLogs returns recent output from a container.
func (d *DockerClient) ContainerLogs(ctx context.Context, idOrName string, opts models.LogOptions) ([]models.LogEntry, error) {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return nil, err
	}

	tail := "100"
	if opts.Tail > 0 {
		tail = strconv.Itoa(opts.Tail)
	}
	logOpts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: true,
		Tail:       tail,
	}
	if !opts.Since.IsZero() {
		logOpts.Since = opts.Since.Format(time.RFC3339)
	}

	rc, err := d.cli.ContainerLogs(ctx, idOrName, logOpts)
	if err != nil {
		return nil, fmt.Errorf("container logs: %w", err)
	}
	defer rc.Close()

	return parseDockerLogStream(rc)
}

// ContainerStats samples resource usage for one container.
func (d *DockerClient) ContainerStats(ctx context.Context, idOrName string) (*models.ContainerStats, error) {
	if _, err := d.GetContainer(ctx, idOrName); err != nil {
		return nil, err
	}

	// A non-streaming read returns a single sample and closes, which is what a
	// REST endpoint wants.
	resp, err := d.cli.ContainerStatsOneShot(ctx, idOrName)
	if err != nil {
		return nil, fmt.Errorf("container stats: %w", err)
	}
	defer resp.Body.Close()

	var raw container.StatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode stats: %w", err)
	}

	return statsToModel(idOrName, &raw), nil
}

// PullImage fetches an image so a container can be created from it.
func (d *DockerClient) PullImage(ctx context.Context, reference string) error {
	rc, err := d.cli.ImagePull(ctx, reference, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pull image %s: %w", reference, err)
	}
	defer rc.Close()

	// The pull only actually happens while the response body is being read,
	// so the stream has to be drained even though the progress is discarded.
	if _, err := io.Copy(io.Discard, rc); err != nil {
		return fmt.Errorf("pull image %s: %w", reference, err)
	}
	return nil
}

// qualifyImage prefixes a bare repository name with Brod's registry, so
// "my-app:v1" resolves to an image pushed to Brod rather than Docker Hub.
//
// A reference that already names a registry, or one that is clearly a public
// image, is left untouched.
func (d *DockerClient) qualifyImage(reference string) string {
	if d.registry == "" {
		return reference
	}
	if strings.HasPrefix(reference, d.registry+"/") {
		return reference
	}

	// A registry host is only possible when the reference has a path
	// separator: in "my-app:v1" the colon introduces a tag, while in
	// "localhost:5000/app" it is a port. Testing the first component without
	// checking for a slash would misread every bare tagged name as qualified.
	if idx := strings.Index(reference, "/"); idx != -1 {
		first := reference[:idx]
		if strings.ContainsAny(first, ".:") || first == "localhost" {
			return reference
		}
	}

	return d.registry + "/" + reference
}

// =============================================================================
// Conversion helpers
// =============================================================================

func summaryToContainer(c container.Summary) models.Container {
	name := ""
	if len(c.Names) > 0 {
		name = strings.TrimPrefix(c.Names[0], "/")
	}

	ports := make([]models.PortMapping, 0, len(c.Ports))
	for _, p := range c.Ports {
		ports = append(ports, models.PortMapping{
			ContainerPort: int(p.PrivatePort),
			HostPort:      int(p.PublicPort),
			Protocol:      p.Type,
		})
	}

	return models.Container{
		ID:           shortID(c.ID),
		Name:         name,
		Image:        c.Image,
		Status:       models.NormaliseStatus(c.State),
		StatusDetail: c.Status,
		Labels:       c.Labels,
		Ports:        ports,
		CreatedAt:    time.Unix(c.Created, 0).UTC(),
	}
}

func inspectToContainer(insp container.InspectResponse) *models.Container {
	out := &models.Container{
		ID:   shortID(insp.ID),
		Name: strings.TrimPrefix(insp.Name, "/"),
	}

	if insp.Config != nil {
		out.Image = insp.Config.Image
		out.Command = insp.Config.Cmd
		out.Labels = insp.Config.Labels
		out.Env = parseEnv(insp.Config.Env)
	}

	if insp.State != nil {
		out.Status = models.NormaliseStatus(insp.State.Status)
		out.StatusDetail = insp.State.Status
		if insp.State.ExitCode != 0 || insp.State.Status == "exited" {
			code := insp.State.ExitCode
			out.ExitCode = &code
		}
		if t, err := time.Parse(time.RFC3339Nano, insp.State.StartedAt); err == nil && !t.IsZero() {
			out.StartedAt = &t
		}
		if t, err := time.Parse(time.RFC3339Nano, insp.State.FinishedAt); err == nil && !t.IsZero() {
			out.FinishedAt = &t
		}
	}

	if t, err := time.Parse(time.RFC3339Nano, insp.Created); err == nil {
		out.CreatedAt = t
	}

	if insp.HostConfig != nil {
		out.MemoryLimit = insp.HostConfig.Memory
		if insp.HostConfig.NanoCPUs > 0 {
			out.CPULimit = float64(insp.HostConfig.NanoCPUs) / 1e9
		}
		out.RestartPolicy = models.RestartPolicy(insp.HostConfig.RestartPolicy.Name)

		for _, bind := range insp.HostConfig.Binds {
			parts := strings.Split(bind, ":")
			if len(parts) >= 2 {
				out.Volumes = append(out.Volumes, models.VolumeMount{
					Source:   parts[0],
					Target:   parts[1],
					ReadOnly: len(parts) > 2 && strings.Contains(parts[2], "ro"),
				})
			}
		}
	}

	if insp.NetworkSettings != nil {
		for port, bindings := range insp.NetworkSettings.Ports {
			for _, b := range bindings {
				hostPort, _ := strconv.Atoi(b.HostPort)
				out.Ports = append(out.Ports, models.PortMapping{
					ContainerPort: port.Int(),
					HostPort:      hostPort,
					Protocol:      port.Proto(),
				})
			}
		}
		for name, n := range insp.NetworkSettings.Networks {
			if n.IPAddress != "" {
				out.IPAddress = n.IPAddress
				out.Network = name
				break
			}
		}
	}

	return out
}

func statsToModel(id string, raw *container.StatsResponse) *models.ContainerStats {
	out := &models.ContainerStats{
		ContainerID: shortID(id),
		SampledAt:   time.Now().UTC(),
		MemoryUsage: int64(raw.MemoryStats.Usage),
		MemoryLimit: int64(raw.MemoryStats.Limit),
	}

	// Docker reports cumulative CPU counters, so utilisation is the delta
	// against the previous sample rather than the raw value.
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage) - float64(raw.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(raw.CPUStats.SystemUsage) - float64(raw.PreCPUStats.SystemUsage)
	if systemDelta > 0 && cpuDelta > 0 {
		cores := float64(raw.CPUStats.OnlineCPUs)
		if cores == 0 {
			cores = float64(len(raw.CPUStats.CPUUsage.PercpuUsage))
		}
		if cores == 0 {
			cores = 1
		}
		out.CPUPercent = (cpuDelta / systemDelta) * cores * 100.0
	}

	if out.MemoryLimit > 0 {
		out.MemoryPct = float64(out.MemoryUsage) / float64(out.MemoryLimit) * 100.0
	}

	for _, n := range raw.Networks {
		out.NetworkRxBytes += int64(n.RxBytes)
		out.NetworkTxBytes += int64(n.TxBytes)
	}

	for _, b := range raw.BlkioStats.IoServiceBytesRecursive {
		switch strings.ToLower(b.Op) {
		case "read":
			out.BlockReadBytes += int64(b.Value)
		case "write":
			out.BlockWriteBytes += int64(b.Value)
		}
	}

	return out
}

// parseDockerLogStream decodes Docker's multiplexed log framing.
//
// When a container has no TTY the daemon interleaves stdout and stderr in a
// stream of 8-byte-headered frames, so the bytes cannot simply be split on
// newlines. A TTY container sends plain text instead, which the fallback
// below handles.
func parseDockerLogStream(r io.Reader) ([]models.LogEntry, error) {
	var entries []models.LogEntry
	br := bufio.NewReader(r)
	header := make([]byte, 8)

	for {
		if _, err := io.ReadFull(br, header); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return entries, fmt.Errorf("read log stream: %w", err)
		}

		streamType := header[0]
		// A valid frame header starts with a stream byte of 0, 1 or 2. Anything
		// else means this is an unframed TTY stream, so fall back to reading
		// the rest as plain lines.
		if streamType > 2 {
			rest, _ := io.ReadAll(io.MultiReader(strings.NewReader(string(header)), br))
			for _, line := range strings.Split(string(rest), "\n") {
				if entry, ok := parseLogLine(line, "stdout"); ok {
					entries = append(entries, entry)
				}
			}
			break
		}

		size := binary.BigEndian.Uint32(header[4:8])
		if size == 0 {
			continue
		}
		payload := make([]byte, size)
		if _, err := io.ReadFull(br, payload); err != nil {
			break
		}

		stream := "stdout"
		if streamType == 2 {
			stream = "stderr"
		}
		for _, line := range strings.Split(string(payload), "\n") {
			if entry, ok := parseLogLine(line, stream); ok {
				entries = append(entries, entry)
			}
		}
	}

	return entries, nil
}

// parseLogLine splits Docker's "RFC3339Nano message" line format.
func parseLogLine(line, stream string) (models.LogEntry, bool) {
	line = strings.TrimRight(line, "\r\n")
	if strings.TrimSpace(line) == "" {
		return models.LogEntry{}, false
	}

	entry := models.LogEntry{Stream: stream, Message: line}
	if idx := strings.Index(line, " "); idx > 0 {
		if ts, err := time.Parse(time.RFC3339Nano, line[:idx]); err == nil {
			entry.Timestamp = ts
			entry.Message = line[idx+1:]
		}
	}
	return entry, true
}

func parseEnv(env []string) map[string]string {
	if len(env) == 0 {
		return nil
	}
	out := make(map[string]string, len(env))
	for _, e := range env {
		if idx := strings.Index(e, "="); idx > 0 {
			out[e[:idx]] = e[idx+1:]
		}
	}
	return out
}

// shortID trims a 64-character Docker id to the 12-character form the CLI
// shows, which is what users recognise.
func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}
