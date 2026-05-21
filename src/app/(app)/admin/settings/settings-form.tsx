"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateSettings, type GlobalSettings } from "@/lib/utils/admin-actions";

export function SettingsForm({ initial, canEdit }: { initial: GlobalSettings; canEdit: boolean }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [systemTitle, setSystemTitle] = useState(initial.systemTitle);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [usablePct, setUsablePct] = useState(initial.containerUsablePercent);
  const [channels, setChannels] = useState<string[]>(initial.salesChannels);
  const [newChannel, setNewChannel] = useState("");
  const [keywords, setKeywords] = useState<Record<string, string[]>>(initial.categoryKeywords);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [saving, startSave] = useTransition();

  function addChannel() {
    const v = newChannel.trim();
    if (!v) return;
    if (channels.includes(v)) { toast.error("Channel already exists."); return; }
    setChannels([...channels, v]);
    setNewChannel("");
  }
  function removeChannel(c: string) {
    setChannels(channels.filter((x) => x !== c));
  }

  function addKeyword(cat: string) {
    const v = newKeyword.trim().toLowerCase();
    if (!v) return;
    const cur = keywords[cat] ?? [];
    if (cur.includes(v)) { toast.error("Keyword already in this category."); return; }
    setKeywords({ ...keywords, [cat]: [...cur, v] });
    setNewKeyword("");
  }
  function removeKeyword(cat: string, kw: string) {
    setKeywords({ ...keywords, [cat]: (keywords[cat] ?? []).filter((x) => x !== kw) });
  }

  function save() {
    startSave(async () => {
      try {
        await updateSettings({
          companyName: companyName.trim(),
          systemTitle: systemTitle.trim(),
          logoUrl: logoUrl.trim() || undefined,
          containerUsablePercent: usablePct,
          categoryKeywords: keywords,
          salesChannels: channels,
        });
        toast.success("Settings saved.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Shown on packing list PDFs and at the top of the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cname">Company name</Label>
              <Input id="cname" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!canEdit || saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stitle">System title</Label>
              <Input id="stitle" value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} disabled={!canEdit || saving} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo URL (optional)</Label>
            <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit || saving} placeholder="https://..." />
            <p className="text-xs text-muted-foreground">
              Reserved for future PDF embedding. Not used in the UI yet.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Container packing</CardTitle>
          <CardDescription>How much of a container's nominal CBM is treated as usable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="pct">Usable percentage</Label>
            <div className="flex items-center gap-3">
              <Input
                id="pct" type="number" step="0.01" min="0.5" max="1"
                value={usablePct}
                onChange={(e) => setUsablePct(Number(e.target.value))}
                disabled={!canEdit || saving}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">= {(usablePct * 100).toFixed(0)}% of nominal CBM</span>
            </div>
            <p className="text-xs text-muted-foreground">
              A 40FT container's 65 CBM nominal × {(usablePct * 100).toFixed(0)}% = <span className="font-mono">{(65 * usablePct).toFixed(2)}</span> CBM usable. Default 0.92.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales channels</CardTitle>
          <CardDescription>Options shown in the PO upload preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <Badge key={c} variant="outline" className="gap-1">
                {c}
                {canEdit && (
                  <button type="button" onClick={() => removeChannel(c)} className="ml-1 opacity-60 hover:opacity-100" disabled={saving}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Input
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                placeholder="Add a channel..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChannel(); } }}
                disabled={saving}
              />
              <Button variant="outline" onClick={addChannel} disabled={!newChannel.trim() || saving}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-category keywords</CardTitle>
          <CardDescription>
            When parsing POs, item descriptions are matched against these keywords to assign a category automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(keywords).map((cat) => (
            <div key={cat} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{cat}</h4>
                <span className="text-xs text-muted-foreground">{keywords[cat]?.length ?? 0} keywords</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(keywords[cat] ?? []).map((kw) => (
                  <Badge key={kw} variant="secondary" className="gap-1 text-xs">
                    {kw}
                    {canEdit && (
                      <button type="button" onClick={() => removeKeyword(cat, kw)} className="ml-1 opacity-60 hover:opacity-100" disabled={saving}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {(keywords[cat]?.length ?? 0) === 0 && (
                  <span className="text-xs italic text-muted-foreground">No keywords yet.</span>
                )}
              </div>
              {canEdit && (
                editingCategory === cat ? (
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="Keyword..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addKeyword(cat); }
                        if (e.key === "Escape") { setEditingCategory(null); setNewKeyword(""); }
                      }}
                      autoFocus
                      disabled={saving}
                    />
                    <Button variant="outline" size="sm" onClick={() => addKeyword(cat)} disabled={!newKeyword.trim() || saving}>Add</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(null); setNewKeyword(""); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(cat); setNewKeyword(""); }}>
                    <Plus className="h-3 w-3" /> Add keyword
                  </Button>
                )
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={save} disabled={saving} size="lg">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save settings</>}
          </Button>
        </div>
      )}
    </div>
  );
}
