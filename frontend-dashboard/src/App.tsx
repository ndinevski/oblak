function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Oblak Cloud Dashboard</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-2">Impuls</h2>
            <p className="text-muted-foreground">Function as a Service</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-2">Izvor</h2>
            <p className="text-muted-foreground">Virtual Machines</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-2">Spomen</h2>
            <p className="text-muted-foreground">Object Storage</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
