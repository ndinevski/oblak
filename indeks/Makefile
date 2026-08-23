.PHONY: build test run clean

build:
	CGO_ENABLED=0 go build -o indeks-server ./cmd/indeks-server

test:
	go test ./...

run: build
	./indeks-server

clean:
	rm -f indeks-server
