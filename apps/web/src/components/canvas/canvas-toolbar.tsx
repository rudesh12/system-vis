'use client';

import { useRef } from 'react';
import { useArchitectureStore } from '@/stores/architecture-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDiscordArchitecture, getUberArchitecture, getNetflixArchitecture, getAmazonArchitecture, getStripeArchitecture } from '@/lib/sample-architectures';
import { parseTerraformArchitecture } from '@/lib/terraform-import';

export function CanvasToolbar() {
  const terraformFileInputRef = useRef<HTMLInputElement>(null);
  const { architectureName, setArchitectureName, nodes, edges, loadArchitecture, clearArchitecture } =
    useArchitectureStore();

  const handleSave = () => {
    const data = JSON.stringify({ nodes, edges, name: architectureName });
    localStorage.setItem('system-vis-architecture', data);

    // Also save to list
    const savedList = JSON.parse(localStorage.getItem('system-vis-saved-list') || '[]');
    const entry = { id: Date.now().toString(), name: architectureName, savedAt: new Date().toISOString() };
    localStorage.setItem('system-vis-saved-list', JSON.stringify([entry, ...savedList.slice(0, 9)]));
  };

  const handleLoad = () => {
    const data = localStorage.getItem('system-vis-architecture');
    if (data) {
      const parsed = JSON.parse(data);
      loadArchitecture(parsed.nodes, parsed.edges, parsed.name);
    }
  };

  const handleLoadSample = (type: string) => {
    let sampleNodes;
    let sampleEdges;
    let sampleName;

    if (type === 'discord') {
      const arch = getDiscordArchitecture();
      sampleNodes = arch.nodes;
      sampleEdges = arch.edges;
      sampleName = arch.name;
    } else if (type === 'uber') {
      const arch = getUberArchitecture();
      sampleNodes = arch.nodes;
      sampleEdges = arch.edges;
      sampleName = arch.name;
    } else if (type === 'netflix') {
      const arch = getNetflixArchitecture();
      sampleNodes = arch.nodes;
      sampleEdges = arch.edges;
      sampleName = arch.name;
    } else if (type === 'stripe') {
      const arch = getStripeArchitecture();
      sampleNodes = arch.nodes;
      sampleEdges = arch.edges;
      sampleName = arch.name;
    } else {
      // ecommerce (Amazon) is default
      const arch = getAmazonArchitecture();
      sampleNodes = arch.nodes;
      sampleEdges = arch.edges;
      sampleName = arch.name;
    }

    loadArchitecture(sampleNodes, sampleEdges, sampleName);
    setArchitectureName(sampleName);
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({ nodes, edges, name: architectureName }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${architectureName.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTerraformButtonClick = () => {
    terraformFileInputRef.current?.click();
  };

  const handleTerraformFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const terraform = await file.text();
      const parsed = parseTerraformArchitecture(terraform, file.name);
      loadArchitecture(parsed.nodes, parsed.edges, parsed.name);
      setArchitectureName(parsed.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse Terraform file.';
      window.alert(message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-2">
      <Input
        value={architectureName}
        onChange={(e) => setArchitectureName(e.target.value)}
        className="w-56 h-8 text-sm bg-card"
      />

      <Select onValueChange={(value: string | null) => { if (value) { handleLoadSample(value); } }}>
        <SelectTrigger className="w-48 h-8 text-sm">
          <SelectValue placeholder="Load sample architecture" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ecommerce">E-Commerce (Amazon)</SelectItem>
          <SelectItem value="discord">Chat (Discord)</SelectItem>
          <SelectItem value="uber">Ride Sharing (Uber)</SelectItem>
          <SelectItem value="netflix">Streaming (Netflix)</SelectItem>
          <SelectItem value="stripe">Payment (Stripe)</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={handleSave}>
        Save
      </Button>
      <Button variant="outline" size="sm" onClick={handleLoad}>
        Load
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportJSON}>
        Export
      </Button>
      <Button variant="outline" size="sm" onClick={handleTerraformButtonClick}>
        Upload Terraform
      </Button>
      <input
        ref={terraformFileInputRef}
        type="file"
        accept=".tf,.hcl,text/plain"
        className="hidden"
        onChange={handleTerraformFileUpload}
      />
      <div className="flex-1" />
      <Button variant="destructive" size="sm" onClick={clearArchitecture}>
        Clear
      </Button>
    </div>
  );
}
