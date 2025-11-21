// AvilloOS Assembled Intelligence Hub
import WorkflowTile from '@/components/workflows/workflow-tile';
import AIOutputCard from '@/components/ai/ai-output-card';

export default function Intelligence() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <WorkflowTile title="Create Listing Description" description="AI optimized property narratives" />
        <WorkflowTile title="Generate Buyer Packet" description="Custom information packet for clients" />
      </div>
      <AIOutputCard title="Sample Output" content="AI results will appear here..." />
    </div>
  );
}
