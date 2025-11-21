// AvilloOS Pricing Table
export default function PricingTable() {
  return (
    <div className="grid md:grid-cols-3 gap-8 p-8">
      <div className="p-6 bg-card border border-border rounded-2xl shadow-md text-foreground">
        <h3 className="text-xl font-semibold mb-2">Starter</h3>
        <p className="text-4xl font-bold mb-4">$29</p>
        <p className="text-muted-foreground">Perfect for new agents</p>
      </div>
      <div className="p-6 bg-card border border-border rounded-2xl shadow-lg text-foreground">
        <h3 className="text-xl font-semibold mb-2">Pro</h3>
        <p className="text-4xl font-bold mb-4">$79</p>
        <p className="text-muted-foreground">Ideal for producing agents</p>
      </div>
      <div className="p-6 bg-card border border-border rounded-2xl shadow-md text-foreground">
        <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
        <p className="text-4xl font-bold mb-4">Custom</p>
        <p className="text-muted-foreground">Teams & brokerages</p>
      </div>
    </div>
  );
}
