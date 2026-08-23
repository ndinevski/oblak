package engine

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"

	"github.com/oblak/tefter/internal/models"
)

// Labels Tefter stamps on every container it creates.
//
// Tefter shares the host's container runtime with the rest of the Oblak
// platform. Listing and mutating only labelled containers means it can never
// stop the dashboard's own Postgres because someone clicked the wrong row.
const (
	ManagedLabel  = "io.oblak.tefter.managed"
	UIDLabel      = "io.oblak.tefter.uid"
	EngineLabel   = "io.oblak.tefter.engine"
	RoleLabel     = "io.oblak.tefter.role"
	SourceLabel   = "io.oblak.tefter.source"
	VersionLabel  = "io.oblak.tefter.version"
	SizeLabel     = "io.oblak.tefter.size"
	DatabaseLabel = "io.oblak.tefter.database"
	UsernameLabel = "io.oblak.tefter.username"

	// Credentials live on the container rather than in a store of Tefter's
	// own: the engine already needs them in its environment, so duplicating
	// them would mean two places to leak from and two places to keep in sync.
	tefterPasswordEnv     = "TEFTER_PASSWORD"
	tefterReplPasswordEnv = "TEFTER_REPLICATION_PASSWORD"
)

// containerPrefix namespaces instance containers so a Tefter instance called
// "orders" cannot collide with an unrelated container of the same name.
const containerPrefix = "tefter-"

// DockerProvisioner runs database instances as containers.
type DockerProvisioner struct {
	cli *client.Client
	cfg DockerConfig
}

// DockerConfig configures the provisioner.
type DockerConfig struct {
	// Host is a Docker endpoint. Empty uses the environment.
	Host string

	// Network the instance containers join, so replicas can reach their
	// primary by container name.
	Network string

	// PortRangeStart is the first host port allocated to an instance.
	PortRangeStart int
	PortRangeEnd   int

	// BackupDir is where dumps are written, inside the Tefter container.
	BackupDir string

	// PublicHost is the address clients use to reach an instance.
	PublicHost string
}

// NewDockerProvisioner connects to the container runtime.
func NewDockerProvisioner(cfg DockerConfig) (*DockerProvisioner, error) {
	opts := []client.Opt{client.WithAPIVersionNegotiation()}
	if cfg.Host != "" {
		opts = append(opts, client.WithHost(cfg.Host))
	} else {
		opts = append(opts, client.FromEnv)
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("create docker client: %w", err)
	}

	if cfg.PortRangeStart == 0 {
		cfg.PortRangeStart = 15000
	}
	if cfg.PortRangeEnd == 0 {
		cfg.PortRangeEnd = 15999
	}
	if cfg.BackupDir == "" {
		cfg.BackupDir = "/var/lib/tefter/backups"
	}
	if cfg.PublicHost == "" {
		cfg.PublicHost = "localhost"
	}

	if err := os.MkdirAll(cfg.BackupDir, 0o750); err != nil {
		return nil, fmt.Errorf("create backup directory: %w", err)
	}

	return &DockerProvisioner{cli: cli, cfg: cfg}, nil
}

func (d *DockerProvisioner) Close() error { return d.cli.Close() }

func (d *DockerProvisioner) HealthCheck(ctx context.Context) error {
	if _, err := d.cli.Ping(ctx); err != nil {
		return fmt.Errorf("%w: %v", models.ErrEngineUnavailable, err)
	}
	return nil
}

func (d *DockerProvisioner) Version(ctx context.Context) (string, error) {
	v, err := d.cli.ServerVersion(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: %v", models.ErrEngineUnavailable, err)
	}
	return v.Version, nil
}

// =============================================================================
// Instances
// =============================================================================

func managedFilter() filters.Args {
	f := filters.NewArgs()
	f.Add("label", ManagedLabel+"=true")
	return f
}

func containerName(instance string) string { return containerPrefix + instance }

// ListInstances returns every Tefter-managed database.
func (d *DockerProvisioner) ListInstances(ctx context.Context) ([]models.DBInstance, error) {
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: managedFilter()})
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}

	out := make([]models.DBInstance, 0, len(list))
	for _, c := range list {
		inst, err := d.inspectInstance(ctx, c.ID)
		if err != nil {
			// A container disappearing mid-listing should not fail the whole
			// call.
			continue
		}
		out = append(out, *inst)
	}

	// Attach each primary's replica list, so the caller can see the topology
	// without a second pass of its own.
	byName := map[string]int{}
	for i := range out {
		byName[out[i].Name] = i
	}
	for i := range out {
		if src := out[i].SourceInstance; src != "" {
			if pi, ok := byName[src]; ok {
				out[pi].Replicas = append(out[pi].Replicas, out[i].Name)
			}
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// GetInstance returns one instance by name.
func (d *DockerProvisioner) GetInstance(ctx context.Context, name string) (*models.DBInstance, error) {
	inst, err := d.inspectInstance(ctx, containerName(name))
	if err != nil {
		return nil, err
	}

	// Fill in replicas, which requires looking at the other containers.
	all, err := d.ListInstances(ctx)
	if err == nil {
		for _, other := range all {
			if other.SourceInstance == name {
				inst.Replicas = append(inst.Replicas, other.Name)
			}
		}
	}
	return inst, nil
}

// inspectInstance reads one container into a DBInstance.
func (d *DockerProvisioner) inspectInstance(ctx context.Context, idOrName string) (*models.DBInstance, error) {
	insp, err := d.cli.ContainerInspect(ctx, idOrName)
	if err != nil {
		if client.IsErrNotFound(err) {
			return nil, fmt.Errorf("%w: instance %s", models.ErrNotFound, strings.TrimPrefix(idOrName, containerPrefix))
		}
		return nil, fmt.Errorf("inspect instance: %w", err)
	}

	// Refuse to expose containers Tefter does not manage, so the API cannot be
	// used to reach unrelated databases on the host.
	if insp.Config == nil || insp.Config.Labels[ManagedLabel] != "true" {
		return nil, fmt.Errorf("%w: instance %s", models.ErrNotFound, strings.TrimPrefix(idOrName, containerPrefix))
	}

	labels := insp.Config.Labels
	inst := &models.DBInstance{
		ID:             shortID(insp.ID),
		Name:           strings.TrimPrefix(strings.TrimPrefix(insp.Name, "/"), containerPrefix),
		UID:            labels[UIDLabel],
		Engine:         models.Engine(labels[EngineLabel]),
		Role:           models.InstanceRole(labels[RoleLabel]),
		Version:        labels[VersionLabel],
		Size:           labels[SizeLabel],
		Database:       labels[DatabaseLabel],
		Username:       labels[UsernameLabel],
		SourceInstance: labels[SourceLabel],
		Image:          insp.Config.Image,
		Host:           d.cfg.PublicHost,
	}

	if inst.Role == "" {
		inst.Role = models.RolePrimary
	}

	if insp.State != nil {
		inst.Status = normaliseStatus(insp.State.Status, insp.State.Health)
		inst.StatusDetail = insp.State.Status
		if t, err := time.Parse(time.RFC3339Nano, insp.State.StartedAt); err == nil && !t.IsZero() {
			inst.StartedAt = &t
		}
	}
	if t, err := time.Parse(time.RFC3339Nano, insp.Created); err == nil {
		inst.CreatedAt = t
	}

	if insp.HostConfig != nil {
		inst.MemoryLimit = insp.HostConfig.Memory
		if insp.HostConfig.NanoCPUs > 0 {
			inst.CPULimit = float64(insp.HostConfig.NanoCPUs) / 1e9
		}
	}

	// The published host port is the one clients connect to.
	if insp.NetworkSettings != nil {
		for port, bindings := range insp.NetworkSettings.Ports {
			for _, b := range bindings {
				if p, err := strconv.Atoi(b.HostPort); err == nil && p > 0 {
					inst.Port = p
					_ = port
					break
				}
			}
		}
	}

	return inst, nil
}

// normaliseStatus maps a container state onto an instance status.
func normaliseStatus(state string, health *container.Health) models.InstanceStatus {
	switch strings.ToLower(state) {
	case "created":
		return models.InstanceStatusCreating
	case "running":
		// A running container whose engine has not finished initialising is
		// not yet usable, and reporting it available would be a lie.
		if health != nil && health.Status == "starting" {
			return models.InstanceStatusStarting
		}
		if health != nil && health.Status == "unhealthy" {
			return models.InstanceStatusFailed
		}
		return models.InstanceStatusAvailable
	case "restarting":
		return models.InstanceStatusStarting
	case "paused", "exited", "removing":
		return models.InstanceStatusStopped
	case "dead":
		return models.InstanceStatusFailed
	}
	return models.InstanceStatusUnknown
}

// CreateInstance provisions a new primary.
func (d *DockerProvisioner) CreateInstance(ctx context.Context, req *models.CreateInstanceRequest, password string) (*models.DBInstance, error) {
	if _, err := d.inspectInstance(ctx, containerName(req.Name)); err == nil {
		return nil, fmt.Errorf("%w: instance %s", models.ErrAlreadyExists, req.Name)
	}

	version, err := models.ResolveVersion(req.Engine, req.Version)
	if err != nil {
		return nil, err
	}
	spec, err := specFor(req.Engine)
	if err != nil {
		return nil, err
	}
	size := models.GetSizeByName(req.Size)
	if size == nil {
		return nil, &models.ValidationError{Field: "size", Message: "unknown size"}
	}

	hostPort, err := d.allocatePort(ctx)
	if err != nil {
		return nil, err
	}

	// A distinct server id per MySQL instance is mandatory; two servers
	// sharing one break replication in confusing ways.
	serverID := serverIDFor(req.Name)
	replPassword := generatePassword(24)

	labels := map[string]string{
		ManagedLabel:  "true",
		UIDLabel:      newInstanceUID(),
		EngineLabel:   string(req.Engine),
		RoleLabel:     string(models.RolePrimary),
		VersionLabel:  version.Version,
		SizeLabel:     req.Size,
		DatabaseLabel: req.Database,
		UsernameLabel: req.Username,
	}

	inst, err := d.runInstanceContainer(ctx, runSpec{
		name:       req.Name,
		image:      version.Image,
		env:        spec.primaryEnv(req, password, replPassword),
		cmd:        spec.primaryCommand(serverID),
		labels:     labels,
		hostPort:   hostPort,
		enginePort: spec.port,
		dataDir:    spec.dataDir,
		size:       size,
	})
	if err != nil {
		return nil, err
	}

	// Wait for initialisation before declaring success: the images create the
	// data directory on first start, and a caller that connects immediately
	// would be refused.
	if err := d.waitReady(ctx, inst, password, 120*time.Second); err != nil {
		return nil, fmt.Errorf("instance %s did not become ready: %w", req.Name, err)
	}

	// Create the replication account now rather than when the first replica is
	// added, so adding one later needs no change to a running primary.
	if out, err := d.exec(ctx, containerName(req.Name), spec.createReplicationUser(inst, password, replPassword)); err != nil {
		return nil, fmt.Errorf("create replication user: %w (%s)", err, out)
	}

	// Grant that account network access. On Postgres this is a separate
	// pg_hba.conf entry without which pg_basebackup is refused outright.
	if grant := spec.allowReplicationAccess(inst, password); len(grant.Argv) > 0 {
		if out, err := d.exec(ctx, containerName(req.Name), grant); err != nil {
			return nil, fmt.Errorf("allow replication access: %w (%s)", err, out)
		}
	}

	// Enable slow-query statistics. Best effort: the library is preloaded at
	// startup (see primaryCommand), so this only creates the extension. If it
	// fails, slow-query metrics are simply absent, which must not fail the
	// whole provisioning.
	if enable := spec.enableSlowQueryStats(inst, password); len(enable.Argv) > 0 {
		if out, err := d.exec(ctx, containerName(req.Name), enable); err != nil {
			log.Printf("tefter: could not enable slow-query stats on %s: %v (%s)", req.Name, err, out)
		}
	}

	return d.GetInstance(ctx, req.Name)
}

// runSpec collects the arguments for creating an instance container.
type runSpec struct {
	name       string
	image      string
	env        []string
	cmd        []string
	labels     map[string]string
	hostPort   int
	enginePort int
	dataDir    string
	size       *models.InstanceSize
	// entrypoint overrides the image's own. Used to clone a Postgres data
	// directory before the server starts.
	entrypoint []string
}

// runInstanceContainer creates and starts one database container.
func (d *DockerProvisioner) runInstanceContainer(ctx context.Context, rs runSpec) (*models.DBInstance, error) {
	if err := d.ensureImage(ctx, rs.image); err != nil {
		return nil, err
	}

	port, err := nat.NewPort("tcp", strconv.Itoa(rs.enginePort))
	if err != nil {
		return nil, fmt.Errorf("invalid engine port: %w", err)
	}

	resources := container.Resources{}
	if rs.size != nil {
		resources.Memory = int64(rs.size.MemoryMB) * 1024 * 1024
		resources.NanoCPUs = int64(rs.size.CPULimit * 1e9)
	}

	created, err := d.cli.ContainerCreate(ctx,
		&container.Config{
			Image:        rs.image,
			Env:          rs.env,
			Cmd:          rs.cmd,
			Entrypoint:   rs.entrypoint,
			Labels:       rs.labels,
			ExposedPorts: nat.PortSet{port: struct{}{}},
		},
		&container.HostConfig{
			PortBindings: nat.PortMap{port: []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: strconv.Itoa(rs.hostPort)}}},
			Mounts: []mount.Mount{{
				Type: mount.TypeVolume,
				// A named volume per instance, so deleting the container does
				// not destroy the data unless the volume goes with it.
				Source: "tefter-data-" + rs.name,
				Target: rs.dataDir,
			}},
			Resources: resources,
			// A database should come back after a host reboot, but a
			// deliberate stop should stick.
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		},
		d.networkConfig(),
		nil,
		containerName(rs.name),
	)
	if err != nil {
		if strings.Contains(err.Error(), "Conflict") || strings.Contains(err.Error(), "already in use") {
			return nil, fmt.Errorf("%w: instance %s", models.ErrAlreadyExists, rs.name)
		}
		return nil, fmt.Errorf("create instance container: %w", err)
	}

	if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		// Leave the container in place: its logs are the only way to find out
		// why the engine would not start.
		return nil, fmt.Errorf("start instance container: %w", err)
	}

	return d.inspectInstance(ctx, created.ID)
}

// networkConfig attaches the container to Tefter's network when one is set, so
// a replica can reach its primary by container name.
func (d *DockerProvisioner) networkConfig() *network.NetworkingConfig {
	if d.cfg.Network == "" {
		return &network.NetworkingConfig{}
	}
	return &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			d.cfg.Network: {},
		},
	}
}

// ensureImage pulls the engine image when it is not already local.
func (d *DockerProvisioner) ensureImage(ctx context.Context, ref string) error {
	if _, err := d.cli.ImageInspect(ctx, ref); err == nil {
		return nil
	}

	rc, err := d.cli.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pull %s: %w", ref, err)
	}
	defer rc.Close()

	// The pull only happens while the body is read, so it must be drained
	// even though the progress output is discarded.
	if _, err := io.Copy(io.Discard, rc); err != nil {
		return fmt.Errorf("pull %s: %w", ref, err)
	}
	return nil
}

// allocatePort finds a free host port in the configured range.
func (d *DockerProvisioner) allocatePort(ctx context.Context) (int, error) {
	used := map[int]bool{}

	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return 0, fmt.Errorf("list containers for port allocation: %w", err)
	}
	// Every container is considered, not just Tefter's: the range is on the
	// host, and colliding with an unrelated service would fail at start with
	// a much less obvious error.
	for _, c := range list {
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				used[int(p.PublicPort)] = true
			}
		}
	}

	for port := d.cfg.PortRangeStart; port <= d.cfg.PortRangeEnd; port++ {
		if !used[port] {
			return port, nil
		}
	}
	return 0, fmt.Errorf("no free port in range %d-%d", d.cfg.PortRangeStart, d.cfg.PortRangeEnd)
}

// DeleteInstance removes an instance and its data volume.
func (d *DockerProvisioner) DeleteInstance(ctx context.Context, name string) error {
	inst, err := d.GetInstance(ctx, name)
	if err != nil {
		return err
	}

	// Deleting a primary out from under its replicas would leave them
	// following nothing, so it is refused until they are gone.
	if len(inst.Replicas) > 0 {
		return fmt.Errorf("%w: %s still has replicas: %s",
			models.ErrHasReplicas, name, strings.Join(inst.Replicas, ", "))
	}

	if err := d.cli.ContainerRemove(ctx, containerName(name), container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("remove instance container: %w", err)
	}

	// The volume outlives the container by design, so it has to be removed
	// explicitly or every deleted instance leaks its disk.
	if err := d.cli.VolumeRemove(ctx, "tefter-data-"+name, true); err != nil {
		return fmt.Errorf("remove instance volume: %w", err)
	}
	return nil
}

// StartInstance starts a stopped instance.
func (d *DockerProvisioner) StartInstance(ctx context.Context, name string) error {
	if _, err := d.GetInstance(ctx, name); err != nil {
		return err
	}
	if err := d.cli.ContainerStart(ctx, containerName(name), container.StartOptions{}); err != nil {
		return fmt.Errorf("start instance: %w", err)
	}
	return nil
}

// StopInstance stops a running instance.
func (d *DockerProvisioner) StopInstance(ctx context.Context, name string) error {
	if _, err := d.GetInstance(ctx, name); err != nil {
		return err
	}
	// A generous timeout: a database flushing to disk on shutdown should be
	// allowed to finish rather than being killed mid-write.
	timeout := 60
	if err := d.cli.ContainerStop(ctx, containerName(name), container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("stop instance: %w", err)
	}
	return nil
}

// =============================================================================
// Replication
// =============================================================================

// CreateReplica provisions a read replica following an existing primary.
func (d *DockerProvisioner) CreateReplica(ctx context.Context, req *models.CreateReplicaRequest, primary *models.DBInstance) (*models.DBInstance, error) {
	if _, err := d.inspectInstance(ctx, containerName(req.Name)); err == nil {
		return nil, fmt.Errorf("%w: instance %s", models.ErrAlreadyExists, req.Name)
	}

	// Replicating a replica would create a chain Tefter does not manage, so
	// it is refused rather than silently allowed.
	if primary.IsReplica() {
		return nil, &models.ValidationError{
			Field:   "source_instance",
			Message: fmt.Sprintf("%s is itself a replica; replicas of replicas are not supported", primary.Name),
		}
	}
	if primary.Status != models.InstanceStatusAvailable {
		return nil, fmt.Errorf("%w: %s must be available to replicate from", models.ErrInstanceNotReady, primary.Name)
	}

	spec, err := specFor(primary.Engine)
	if err != nil {
		return nil, err
	}
	version, err := models.ResolveVersion(primary.Engine, primary.Version)
	if err != nil {
		return nil, err
	}
	size := models.GetSizeByName(req.Size)
	if size == nil {
		return nil, &models.ValidationError{Field: "size", Message: "unknown size"}
	}

	primaryPassword, replPassword, err := d.credentials(ctx, primary.Name)
	if err != nil {
		return nil, err
	}

	// Re-assert the primary's replication access. CreateInstance already does
	// this, but a primary provisioned before that step existed would otherwise
	// reject the seed, and the command is idempotent.
	if grant := spec.allowReplicationAccess(primary, primaryPassword); len(grant.Argv) > 0 {
		if out, err := d.exec(ctx, containerName(primary.Name), grant); err != nil {
			return nil, fmt.Errorf("allow replication access on %s: %w (%s)", primary.Name, err, out)
		}
	}

	hostPort, err := d.allocatePort(ctx)
	if err != nil {
		return nil, err
	}

	labels := map[string]string{
		ManagedLabel: "true",
		// A replica is its own instance with its own identity, so it gets a
		// fresh UID rather than inheriting the primary's.
		UIDLabel:      newInstanceUID(),
		EngineLabel:   string(primary.Engine),
		RoleLabel:     string(models.RoleReplica),
		SourceLabel:   primary.Name,
		VersionLabel:  primary.Version,
		SizeLabel:     req.Size,
		DatabaseLabel: primary.Database,
		UsernameLabel: primary.Username,
	}

	// The replica runs with the same credentials as its primary: after
	// replication it holds the same user table, so a different password would
	// stop working the moment the first sync completed.
	env := []string{
		tefterPasswordEnv + "=" + primaryPassword,
		tefterReplPasswordEnv + "=" + replPassword,
	}
	switch primary.Engine {
	case models.EnginePostgres:
		env = append(env,
			"POSTGRES_USER="+primary.Username,
			"POSTGRES_PASSWORD="+primaryPassword,
			"POSTGRES_DB="+primary.Database,
			"PGDATA="+spec.dataDir,
		)
	case models.EngineMySQL:
		env = append(env,
			"MYSQL_ROOT_PASSWORD="+primaryPassword,
			"MYSQL_DATABASE="+primary.Database,
			"MYSQL_USER="+primary.Username,
			"MYSQL_PASSWORD="+primaryPassword,
		)
	}

	serverID := serverIDFor(req.Name)
	primaryContainer := containerName(primary.Name)

	rs := runSpec{
		name:       req.Name,
		image:      version.Image,
		env:        env,
		cmd:        spec.replicaCommand(serverID),
		labels:     labels,
		hostPort:   hostPort,
		enginePort: spec.port,
		dataDir:    spec.dataDir,
		size:       size,
	}

	// Postgres needs its data directory cloned from the primary before the
	// server starts, so the container is created with an entrypoint that runs
	// pg_basebackup first. MySQL seeds itself from the primary's binlog.
	if primary.Engine == models.EnginePostgres {
		seed := spec.seedReplica(primaryContainer, replPassword)
		rs.env = append(rs.env, seed.Env...)
		// A shell wrapper is unavoidable here: the clone has to happen inside
		// the container, before postgres opens the data directory, and only
		// when the directory is empty so a restart does not re-clone.
		rs.cmd = nil
		rs.entrypoint = []string{"bash", "-c", fmt.Sprintf(
			`set -e
			 if [ ! -s "%s/PG_VERSION" ]; then
			   echo "tefter: seeding replica from %s"
			   rm -rf %s/*
			   %s
			   chmod 0700 %s
			 fi
			 exec docker-entrypoint.sh %s`,
			spec.dataDir,
			primaryContainer,
			spec.dataDir,
			strings.Join(seed.Argv, " "),
			spec.dataDir,
			strings.Join(spec.replicaCommand(serverID), " "),
		)}
	}

	replica, err := d.runInstanceContainer(ctx, rs)
	if err != nil {
		return nil, err
	}

	if err := d.waitReady(ctx, replica, primaryPassword, 180*time.Second); err != nil {
		return nil, fmt.Errorf("replica %s did not become ready: %w", req.Name, err)
	}

	// MySQL seeds after boot rather than before it, since the import needs a
	// running server. Postgres was already cloned by the entrypoint above.
	if primary.Engine == models.EngineMySQL {
		seed := spec.seedReplicaMySQL(primaryContainer, primary.Database)
		if out, err := d.exec(ctx, containerName(req.Name), seed); err != nil {
			return nil, fmt.Errorf("seed replica from %s: %w (%s)", primary.Name, err, out)
		}
	}

	// MySQL only starts following once it is told where the primary is.
	if primary.Engine == models.EngineMySQL {
		start := spec.startReplication(primaryContainer, primaryPassword, replPassword)
		if out, err := d.exec(ctx, containerName(req.Name), start); err != nil {
			return nil, fmt.Errorf("start replication: %w (%s)", err, out)
		}
	}

	// Close the replica to writes. Done last, because on MySQL this cannot be
	// set until the server has initialised, and setting it before replication
	// is configured would block the replication setup itself.
	if ro := spec.enforceReadOnly(replica, primaryPassword); len(ro.Argv) > 0 {
		if out, err := d.exec(ctx, containerName(req.Name), ro); err != nil {
			return nil, fmt.Errorf("enforce read-only: %w (%s)", err, out)
		}
	}

	return d.GetInstance(ctx, req.Name)
}

// ReplicationStatus reports how far behind a replica is.
func (d *DockerProvisioner) ReplicationStatus(ctx context.Context, replica *models.DBInstance) (*models.ReplicationStatus, error) {
	if !replica.IsReplica() {
		return nil, &models.ValidationError{
			Field:   "instance",
			Message: fmt.Sprintf("%s is a primary, not a replica", replica.Name),
		}
	}

	spec, err := specFor(replica.Engine)
	if err != nil {
		return nil, err
	}
	password, _, err := d.credentials(ctx, replica.Name)
	if err != nil {
		return nil, err
	}

	out, err := d.exec(ctx, containerName(replica.Name), spec.replicationStatus(replica, password))
	if err != nil {
		// A failed status query is itself a replication problem worth
		// reporting, rather than an error that hides the instance.
		return &models.ReplicationStatus{
			Instance:       replica.Name,
			SourceInstance: replica.SourceInstance,
			State:          models.ReplicationError,
			Detail:         fmt.Sprintf("could not query replication status: %v", err),
			CheckedAt:      time.Now().UTC(),
		}, nil
	}

	var status *models.ReplicationStatus
	switch replica.Engine {
	case models.EnginePostgres:
		status = parsePostgresLag(out)
	case models.EngineMySQL:
		status = parseMySQLLag(out)
	default:
		status = &models.ReplicationStatus{State: models.ReplicationUnknown}
	}

	status.Instance = replica.Name
	status.SourceInstance = replica.SourceInstance
	status.CheckedAt = time.Now().UTC()
	return status, nil
}

// Stats reads an instance's internal counters for the observability collector.
func (d *DockerProvisioner) Stats(ctx context.Context, inst *models.DBInstance) (*models.InstanceStats, error) {
	base := &models.InstanceStats{
		Instance:    inst.Name,
		Engine:      inst.Engine,
		Role:        inst.Role,
		CollectedAt: time.Now().UTC(),
	}

	// An instance that is not running cannot answer, and that is a fact worth
	// reporting (Up=false), not an error that drops it from the dashboard.
	if inst.Status != models.InstanceStatusAvailable {
		return base, nil
	}

	spec, err := specFor(inst.Engine)
	if err != nil {
		return nil, err
	}
	password, _, err := d.credentials(ctx, inst.Name)
	if err != nil {
		return nil, err
	}

	out, err := d.exec(ctx, containerName(inst.Name), spec.statsQuery(inst, password))
	if err != nil {
		// Running but unresponsive: report it as down rather than failing the
		// whole collection sweep.
		return base, nil
	}
	parsed, ok := parseInstanceStats(out)
	if !ok {
		return base, nil
	}
	parsed.Instance = inst.Name
	parsed.Engine = inst.Engine
	parsed.Role = inst.Role
	parsed.Up = true
	parsed.CollectedAt = time.Now().UTC()

	// Slow-query stats come from a separate source that may be absent (a
	// Postgres instance created before pg_stat_statements was preloaded), so a
	// failure here leaves the fields nil ("unknown") rather than losing the
	// core stats.
	if out, err := d.exec(ctx, containerName(inst.Name), spec.slowQueryQuery(inst, password)); err == nil {
		if count, slowest, ok := parseSlowQueries(out); ok {
			parsed.SlowQueries = &count
			parsed.SlowestQueryMeanMs = &slowest
		}
	}

	// A replica's lag is part of its health, so fold it in here rather than
	// making the collector make a second call.
	if inst.IsReplica() {
		if out, err := d.exec(ctx, containerName(inst.Name), spec.replicationStatus(inst, password)); err == nil {
			var status *models.ReplicationStatus
			switch inst.Engine {
			case models.EnginePostgres:
				status = parsePostgresLag(out)
			case models.EngineMySQL:
				status = parseMySQLLag(out)
			}
			if status != nil && status.LagSeconds != nil {
				parsed.ReplicationLagSeconds = status.LagSeconds
			}
		}
	}

	return parsed, nil
}

// PromoteReplica turns a follower into a standalone primary.
//
// Two steps, both necessary: the engine has to stop following, and the
// container's labels have to stop saying "replica". Docker cannot relabel a
// running container, so the container is recreated against the same data
// volume. The data lives in the volume, not the container, so this is a
// restart rather than a rebuild.
func (d *DockerProvisioner) PromoteReplica(ctx context.Context, replica *models.DBInstance) error {
	if !replica.IsReplica() {
		return &models.ValidationError{
			Field:   "instance",
			Message: fmt.Sprintf("%s is already a primary", replica.Name),
		}
	}

	spec, err := specFor(replica.Engine)
	if err != nil {
		return err
	}
	password, replPassword, err := d.credentials(ctx, replica.Name)
	if err != nil {
		return err
	}

	// Tell the engine to stop following. After this the data is a valid
	// standalone database even if the relabel below fails.
	if out, err := d.exec(ctx, containerName(replica.Name), spec.promote(replica, password)); err != nil {
		return fmt.Errorf("promote replica: %w (%s)", err, out)
	}

	// A promoted instance has to accept writes, or it is a primary in name
	// only. The container is recreated below, which drops the drop-in config
	// file, but the running server needs telling now.
	if rw := spec.allowWrites(replica, password); len(rw.Argv) > 0 {
		if out, err := d.exec(ctx, containerName(replica.Name), rw); err != nil {
			return fmt.Errorf("allow writes after promotion: %w (%s)", err, out)
		}
	}

	// Read the current container so the replacement keeps its port, image and
	// resource limits.
	insp, err := d.cli.ContainerInspect(ctx, containerName(replica.Name))
	if err != nil {
		return fmt.Errorf("inspect promoted instance: %w", err)
	}

	hostPort := replica.Port
	if hostPort == 0 {
		if hostPort, err = d.allocatePort(ctx); err != nil {
			return err
		}
	}

	size := models.GetSizeByName(replica.Size)
	if size == nil {
		size = models.GetSizeByName("small")
	}

	labels := map[string]string{
		ManagedLabel: "true",
		// Promotion recreates the container but it is the same instance, so its
		// identity has to carry over: its backups are keyed by this UID.
		UIDLabel:    replica.UID,
		EngineLabel: string(replica.Engine),
		// The point of the recreate: it is a primary now, and no longer
		// follows anything.
		RoleLabel:     string(models.RolePrimary),
		VersionLabel:  replica.Version,
		SizeLabel:     replica.Size,
		DatabaseLabel: replica.Database,
		UsernameLabel: replica.Username,
	}

	env := insp.Config.Env
	image := insp.Config.Image

	timeout := 60
	if err := d.cli.ContainerStop(ctx, containerName(replica.Name), container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("stop promoted instance: %w", err)
	}
	// Only the container is removed. The named volume holds the data and is
	// deliberately left alone.
	if err := d.cli.ContainerRemove(ctx, containerName(replica.Name), container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("remove promoted container: %w", err)
	}

	_, err = d.runInstanceContainer(ctx, runSpec{
		name:  replica.Name,
		image: image,
		env:   env,
		// Restarted with primary settings: a promoted MySQL server must drop
		// read-only, and a promoted Postgres no longer has standby.signal.
		cmd:        spec.primaryCommand(serverIDFor(replica.Name)),
		labels:     labels,
		hostPort:   hostPort,
		enginePort: spec.port,
		dataDir:    spec.dataDir,
		size:       size,
	})
	if err != nil {
		return fmt.Errorf("restart promoted instance: %w", err)
	}

	promoted := *replica
	promoted.Role = models.RolePrimary
	if err := d.waitReady(ctx, &promoted, password, 120*time.Second); err != nil {
		return fmt.Errorf("promoted instance %s did not come back: %w", replica.Name, err)
	}

	// It can take replicas of its own now, so it needs the replication user
	// its data may not already carry.
	if out, err := d.exec(ctx, containerName(replica.Name),
		spec.createReplicationUser(&promoted, password, replPassword)); err != nil {
		return fmt.Errorf("recreate replication user after promotion: %w (%s)", err, out)
	}

	return nil
}

// =============================================================================
// Backups
// =============================================================================

// CreateBackup takes a logical dump of an instance.
func (d *DockerProvisioner) CreateBackup(ctx context.Context, inst *models.DBInstance, req *models.CreateBackupRequest) (*models.Backup, error) {
	if inst.Status != models.InstanceStatusAvailable {
		return nil, fmt.Errorf("%w: %s must be available to back up", models.ErrInstanceNotReady, inst.Name)
	}

	spec, err := specFor(inst.Engine)
	if err != nil {
		return nil, err
	}
	password, _, err := d.credentials(ctx, inst.Name)
	if err != nil {
		return nil, err
	}

	started := time.Now().UTC()
	backup := &models.Backup{
		ID:          models.NewBackupID(inst.Name, started),
		Instance:    inst.Name,
		InstanceUID: inst.UID,
		Engine:      inst.Engine,
		Database:    inst.Database,
		Status:      models.BackupStatusRunning,
		Type:        req.Type,
		Description: req.Description,
		StartedAt:   started,
	}

	path := d.backupPath(backup.ID)
	// Refuse to write over an existing backup. Ids are unique by construction,
	// so a collision here means an assumption has broken somewhere, and the
	// wrong response to that is to destroy the older backup: it may be the
	// only copy of data someone is about to restore.
	if _, err := os.Stat(path); err == nil {
		return nil, fmt.Errorf("%w: backup %s", models.ErrAlreadyExists, backup.ID)
	}

	// Written to a temporary name and renamed on success, so a crash mid-dump
	// cannot leave a truncated file that looks like a usable backup.
	tmpPath := path + ".partial"

	file, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
	if err != nil {
		return nil, fmt.Errorf("create backup file: %w", err)
	}

	dumpErr := d.execStream(ctx, containerName(inst.Name), spec.dump(inst, password), file)
	closeErr := file.Close()

	if dumpErr != nil || closeErr != nil {
		os.Remove(tmpPath)
		backup.Status = models.BackupStatusFailed
		if dumpErr != nil {
			backup.Error = dumpErr.Error()
		} else {
			backup.Error = closeErr.Error()
		}
		return backup, fmt.Errorf("backup failed: %w", firstErr(dumpErr, closeErr))
	}

	info, err := os.Stat(tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		return nil, fmt.Errorf("stat backup file: %w", err)
	}
	// An empty dump means the command produced nothing, which is a failure
	// however cleanly it exited.
	if info.Size() == 0 {
		os.Remove(tmpPath)
		backup.Status = models.BackupStatusFailed
		backup.Error = "the dump produced no output"
		return backup, fmt.Errorf("backup failed: the dump produced no output")
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return nil, fmt.Errorf("finalise backup: %w", err)
	}

	completed := time.Now().UTC()
	backup.Status = models.BackupStatusAvailable
	backup.SizeBytes = info.Size()
	backup.Path = path
	backup.CompletedAt = &completed
	backup.DurationSeconds = completed.Sub(started).Seconds()

	if err := d.writeBackupMeta(backup); err != nil {
		return nil, err
	}
	return backup, nil
}

// ListBackups returns backups, optionally filtered to one instance.
//
// When filtered to an instance name, the filter is by identity, not just name:
// only backups belonging to the instance that currently holds that name are
// returned, so backups of an earlier, since deleted instance that reused the
// name do not appear as though they belong to the new one. Backups taken
// before UIDs existed (empty InstanceUID) fall back to matching by name, so an
// upgrade does not hide anyone's existing backups.
//
// Every returned backup has FromDeletedInstance computed: true when no live
// instance shares its identity.
func (d *DockerProvisioner) ListBackups(ctx context.Context, instanceName string) ([]models.Backup, error) {
	entries, err := os.ReadDir(d.cfg.BackupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.Backup{}, nil
		}
		return nil, fmt.Errorf("read backup directory: %w", err)
	}

	// Map every live instance's UID (and name, for legacy backups) so each
	// backup can be told from one whose instance is gone. Best effort: if the
	// listing fails, backups are still returned, just without the flag.
	liveUIDs := map[string]bool{}
	liveNames := map[string]bool{}
	if instances, lerr := d.ListInstances(ctx); lerr == nil {
		for _, inst := range instances {
			if inst.UID != "" {
				liveUIDs[inst.UID] = true
			}
			liveNames[inst.Name] = true
		}
	}

	// The identity to filter to, when a name was given.
	var wantUID string
	var haveInstance bool
	if instanceName != "" {
		if inst, gerr := d.GetInstance(ctx, instanceName); gerr == nil {
			haveInstance = true
			wantUID = inst.UID
		}
	}

	out := make([]models.Backup, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), metaExt) {
			continue
		}
		backup, err := d.readBackupMeta(strings.TrimSuffix(e.Name(), metaExt))
		if err != nil {
			continue
		}

		if instanceName != "" {
			if backup.Instance != instanceName {
				continue
			}
			// Same name, but is it the same instance? When the instance exists
			// and both sides have a UID, they must match. A legacy backup
			// (no UID) is kept, since it cannot be disambiguated and hiding it
			// would lose it from view.
			if haveInstance && wantUID != "" && backup.InstanceUID != "" &&
				backup.InstanceUID != wantUID {
				continue
			}
		}

		// A backup is from a deleted instance when nothing live shares its
		// identity: by UID when it has one, otherwise by name.
		if backup.InstanceUID != "" {
			backup.FromDeletedInstance = !liveUIDs[backup.InstanceUID]
		} else {
			backup.FromDeletedInstance = !liveNames[backup.Instance]
		}

		out = append(out, *backup)
	}

	// Newest first: the most recent backup is the one anyone is looking for.
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.After(out[j].StartedAt) })
	return out, nil
}

// GetBackup returns one backup by id.
func (d *DockerProvisioner) GetBackup(ctx context.Context, id string) (*models.Backup, error) {
	if !models.IsValidBackupID(id) {
		return nil, &models.ValidationError{Field: "backup_id", Message: "malformed backup id"}
	}
	return d.readBackupMeta(id)
}

// DeleteBackup removes a backup and its metadata.
func (d *DockerProvisioner) DeleteBackup(ctx context.Context, id string) error {
	backup, err := d.GetBackup(ctx, id)
	if err != nil {
		return err
	}
	if err := os.Remove(d.backupPath(backup.ID)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove backup file: %w", err)
	}
	if err := os.Remove(d.metaPath(backup.ID)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove backup metadata: %w", err)
	}
	return nil
}

// RestoreBackup loads a dump into an instance.
func (d *DockerProvisioner) RestoreBackup(ctx context.Context, backup *models.Backup, target *models.DBInstance) error {
	if target.Status != models.InstanceStatusAvailable {
		return fmt.Errorf("%w: %s must be available to restore into", models.ErrInstanceNotReady, target.Name)
	}
	// Writing to a replica would diverge it from its primary, and the write
	// would be rejected anyway.
	if target.IsReplica() {
		return &models.ValidationError{
			Field:   "target_instance",
			Message: fmt.Sprintf("%s is a read replica and cannot be restored into", target.Name),
		}
	}
	// A Postgres dump restored into MySQL would fail deep into the load,
	// leaving a half-populated database.
	if backup.Engine != target.Engine {
		return &models.ValidationError{
			Field: "target_instance",
			Message: fmt.Sprintf("backup is a %s dump but %s is %s",
				backup.Engine, target.Name, target.Engine),
		}
	}

	spec, err := specFor(target.Engine)
	if err != nil {
		return err
	}
	password, _, err := d.credentials(ctx, target.Name)
	if err != nil {
		return err
	}

	file, err := os.Open(d.backupPath(backup.ID))
	if err != nil {
		return fmt.Errorf("open backup file: %w", err)
	}
	defer file.Close()

	out, err := d.execInput(ctx, containerName(target.Name), spec.restore(target, password), file)
	if err != nil {
		return fmt.Errorf("restore failed: %w (%s)", err, truncate(out, 500))
	}
	return nil
}

// =============================================================================
// Backup storage helpers
// =============================================================================

const metaExt = ".meta.json"

func (d *DockerProvisioner) backupPath(id string) string {
	return filepath.Join(d.cfg.BackupDir, id+".sql")
}

func (d *DockerProvisioner) metaPath(id string) string {
	return filepath.Join(d.cfg.BackupDir, id+metaExt)
}

func (d *DockerProvisioner) writeBackupMeta(b *models.Backup) error {
	data, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return fmt.Errorf("encode backup metadata: %w", err)
	}
	if err := os.WriteFile(d.metaPath(b.ID), data, 0o640); err != nil {
		return fmt.Errorf("write backup metadata: %w", err)
	}
	return nil
}

func (d *DockerProvisioner) readBackupMeta(id string) (*models.Backup, error) {
	data, err := os.ReadFile(d.metaPath(id))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: backup %s", models.ErrNotFound, id)
		}
		return nil, fmt.Errorf("read backup metadata: %w", err)
	}
	var b models.Backup
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, fmt.Errorf("decode backup metadata: %w", err)
	}
	return &b, nil
}

// =============================================================================
// Container exec
// =============================================================================

// exec runs a command in a container and returns its combined output.
func (d *DockerProvisioner) exec(ctx context.Context, container string, spec execSpec) (string, error) {
	var buf bytes.Buffer
	err := d.execStream(ctx, container, spec, &buf)
	return buf.String(), err
}

// execStream runs a command and writes its stdout to w.
func (d *DockerProvisioner) execStream(ctx context.Context, containerID string, spec execSpec, w io.Writer) error {
	return d.execWith(ctx, containerID, spec, nil, w)
}

// execInput runs a command with r as its stdin and returns its output.
func (d *DockerProvisioner) execInput(ctx context.Context, containerID string, spec execSpec, r io.Reader) (string, error) {
	var buf bytes.Buffer
	err := d.execWith(ctx, containerID, spec, r, &buf)
	return buf.String(), err
}

// execWith is the single implementation behind exec, execStream and execInput.
func (d *DockerProvisioner) execWith(ctx context.Context, containerID string, spec execSpec, stdin io.Reader, stdout io.Writer) error {
	if len(spec.Argv) == 0 {
		return fmt.Errorf("%w: no command for this engine", models.ErrNotSupported)
	}

	created, err := d.cli.ContainerExecCreate(ctx, containerID, container.ExecOptions{
		Cmd:          spec.Argv,
		Env:          spec.Env,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  stdin != nil,
	})
	if err != nil {
		return fmt.Errorf("create exec: %w", err)
	}

	attached, err := d.cli.ContainerExecAttach(ctx, created.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("attach exec: %w", err)
	}
	defer attached.Close()

	if stdin != nil {
		// Written in a goroutine and closed when done: a large restore would
		// otherwise deadlock against the output the command produces while
		// still reading.
		go func() {
			_, _ = io.Copy(attached.Conn, stdin)
			_ = attached.CloseWrite()
		}()
	}

	var stderr bytes.Buffer
	if err := demuxDockerStream(attached.Reader, stdout, &stderr); err != nil {
		return fmt.Errorf("read exec output: %w", err)
	}

	insp, err := d.cli.ContainerExecInspect(ctx, created.ID)
	if err != nil {
		return fmt.Errorf("inspect exec: %w", err)
	}
	if insp.ExitCode != 0 {
		return fmt.Errorf("command exited %d: %s", insp.ExitCode, truncate(stderr.String(), 500))
	}
	return nil
}

// demuxDockerStream splits Docker's multiplexed exec output.
//
// Without a TTY the daemon interleaves stdout and stderr in 8-byte-headered
// frames, so the bytes cannot simply be copied: a dump written straight
// through would have frame headers embedded in the SQL.
func demuxDockerStream(r io.Reader, stdout, stderr io.Writer) error {
	header := make([]byte, 8)
	for {
		if _, err := io.ReadFull(r, header); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return err
		}

		size := binary.BigEndian.Uint32(header[4:8])
		if size == 0 {
			continue
		}

		dst := stdout
		if header[0] == 2 {
			dst = stderr
		}
		if _, err := io.CopyN(dst, r, int64(size)); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

// waitReady blocks until the engine accepts connections, or the deadline
// passes.
func (d *DockerProvisioner) waitReady(ctx context.Context, inst *models.DBInstance, password string, timeout time.Duration) error {
	spec, err := specFor(inst.Engine)
	if err != nil {
		return err
	}

	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if _, err := d.exec(ctx, containerName(inst.Name), spec.ready(inst, password)); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("timed out after %s: %v", timeout, lastErr)
}

// credentials reads an instance's passwords back off its container.
func (d *DockerProvisioner) credentials(ctx context.Context, name string) (password, replPassword string, err error) {
	insp, err := d.cli.ContainerInspect(ctx, containerName(name))
	if err != nil {
		return "", "", fmt.Errorf("%w: instance %s", models.ErrNotFound, name)
	}
	if insp.Config == nil {
		return "", "", fmt.Errorf("instance %s has no configuration", name)
	}

	for _, e := range insp.Config.Env {
		if v, ok := strings.CutPrefix(e, tefterPasswordEnv+"="); ok {
			password = v
		}
		if v, ok := strings.CutPrefix(e, tefterReplPasswordEnv+"="); ok {
			replPassword = v
		}
	}
	if password == "" {
		return "", "", fmt.Errorf("instance %s has no stored credentials", name)
	}
	return password, replPassword, nil
}

// =============================================================================
// Small helpers
// =============================================================================

// serverIDFor derives a stable, non-zero MySQL server id from an instance
// name. Two servers sharing an id break replication, and a hash of the name
// keeps them distinct without Tefter having to track a counter.
func serverIDFor(name string) int {
	var h uint32 = 2166136261
	for i := 0; i < len(name); i++ {
		h ^= uint32(name[i])
		h *= 16777619
	}
	// Kept well inside MySQL's 32-bit unsigned range and never zero, which is
	// reserved.
	return int(h%4000000000) + 1
}

// generatePassword builds a random alphanumeric password.
//
// Alphanumeric only: these end up inside SQL string literals and shell
// commands, and excluding punctuation removes a whole class of quoting bug.
// newInstanceUID returns a stable, unique identity for an instance. It is
// opaque and never parsed; it only ever has to be unique and to survive being
// stored as a container label.
func newInstanceUID() string {
	return generatePassword(20)
}

func generatePassword(n int) string {
	const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, n)
	for i := range out {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			// crypto/rand failing is not something to paper over with a weaker
			// source; a predictable database password is worse than a crash.
			panic(fmt.Sprintf("tefter: secure random unavailable: %v", err))
		}
		out[i] = alphabet[idx.Int64()]
	}
	return string(out)
}

// GeneratePassword exposes password generation to the API layer.
func GeneratePassword(n int) string { return generatePassword(n) }

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

// parseFloat and parseInt keep strconv out of engine_spec.go's imports.
func parseFloat(s string) (float64, error) { return strconv.ParseFloat(strings.TrimSpace(s), 64) }
func parseInt(s string) (int64, error)     { return strconv.ParseInt(strings.TrimSpace(s), 10, 64) }
