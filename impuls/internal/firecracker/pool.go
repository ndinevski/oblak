package firecracker

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// VMPool manages a pool of pre-warmed VMs for faster cold starts
type VMPool struct {
	manager  *Manager
	pools    map[string]chan *VM // runtime -> pool of warm VMs
	poolSize int
	mu       sync.RWMutex
	stopChan chan struct{}
}

// NewVMPool creates a new VM pool
func NewVMPool(manager *Manager, poolSize int) *VMPool {
	pool := &VMPool{
		manager:  manager,
		pools:    make(map[string]chan *VM),
		poolSize: poolSize,
		stopChan: make(chan struct{}),
	}

	// Initialize pools for supported runtimes
	runtimes := []string{"nodejs20", "nodejs18", "python312", "python311", "dotnet8", "dotnet7"}
	for _, runtime := range runtimes {
		pool.pools[runtime] = make(chan *VM, poolSize)
	}

	return pool
}

// Start starts the pool manager which keeps pools warm
func (p *VMPool) Start(ctx context.Context) {
	go p.warmPoolsLoop(ctx)
}

// warmPoolsLoop continuously ensures pools are warm
func (p *VMPool) warmPoolsLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-p.stopChan:
			return
		case <-ticker.C:
			p.warmPools(ctx)
		}
	}
}

// warmPools ensures each pool has the minimum number of VMs
func (p *VMPool) warmPools(ctx context.Context) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	for runtime, pool := range p.pools {
		current := len(pool)
		needed := p.poolSize - current

		for i := 0; i < needed; i++ {
			go func(rt string, pl chan *VM) {
				vm, err := p.createWarmVM(ctx, rt)
				if err != nil {
					fmt.Printf("Failed to create warm VM for %s: %v\n", rt, err)
					return
				}

				select {
				case pl <- vm:
				default:
					// Pool is full, stop this VM
					p.manager.StopVM(vm.ID)
				}
			}(runtime, pool)
		}
	}
}

// createWarmVM creates a VM ready to receive function code
func (p *VMPool) createWarmVM(ctx context.Context, runtime string) (*VM, error) {
	config := VMConfig{
		Runtime:  runtime,
		MemoryMB: 128,
		VCPUs:    1,
	}

	return p.manager.CreateVM(ctx, config)
}

// GetVM gets a warm VM from the pool or creates a new one
func (p *VMPool) GetVM(ctx context.Context, runtime string) (*VM, error) {
	p.mu.RLock()
	pool, exists := p.pools[runtime]
	p.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("unsupported runtime: %s", runtime)
	}

	// Try to get from pool first
	select {
	case vm := <-pool:
		return vm, nil
	default:
		// Pool empty, create new VM
		return p.createWarmVM(ctx, runtime)
	}
}

// ReturnVM returns a VM to the pool
func (p *VMPool) ReturnVM(vm *VM, reusable bool) {
	if !reusable {
		p.manager.StopVM(vm.ID)
		return
	}

	p.mu.RLock()
	pool, exists := p.pools[vm.Config.Runtime]
	p.mu.RUnlock()

	if !exists {
		p.manager.StopVM(vm.ID)
		return
	}

	select {
	case pool <- vm:
		// Returned to pool
	default:
		// Pool full, stop VM
		p.manager.StopVM(vm.ID)
	}
}

// Stop stops the pool and all VMs
func (p *VMPool) Stop() {
	close(p.stopChan)

	p.mu.Lock()
	defer p.mu.Unlock()

	for _, pool := range p.pools {
		close(pool)
		for vm := range pool {
			p.manager.StopVM(vm.ID)
		}
	}
}
