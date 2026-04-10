import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { RiAdvertisementLine, RiGlobalLine, RiSave3Line, RiAddLine, RiInformationLine, RiLoader4Line, RiEditLine } from "@remixicon/react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { adsApi } from "@/lib/api"

export function DashboardAds() {
  const [provider, setProvider] = useState("adsterra")
  const [adType, setAdType] = useState("smart_link")
  const [isActive, setIsActive] = useState(false)
  const [adCode, setAdCode] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [allConfigs, setAllConfigs] = useState<any[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    adsApi.getSettings()
      .then(data => {
        setAllConfigs(data)
        const adsterra = data.find(c => c.provider === "adsterra")
        if (adsterra) {
          setAdType(adsterra.adType)
          setAdCode(adsterra.adCode)
          setIsActive(adsterra.isActive)
        }
      })
      .catch((err) => {
        console.error(err)
        toast.error("Failed to load ad settings")
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleProviderChange = (val: string) => {
    setProvider(val)
    const existing = allConfigs.find(c => c.provider === val)
    if (existing) {
      setAdType(existing.adType)
      setAdCode(existing.adCode)
      setIsActive(existing.isActive)
    } else {
      let defaultFormat = "popunder"
      if (val === "adsterra") defaultFormat = "smart_link"
      if (val === "monetag" || val === "shopee" || val === "tiktok" || val === "direct") defaultFormat = "direct_link"
      setAdType(defaultFormat)
      setAdCode("")
      setIsActive(false)
    }
  }

  const handleSave = async () => {
    if (provider === "adsterra" && adType === "smart_link" && adCode.trim()) {
      try {
        const url = new URL(adCode.trim());
        if (!url.hostname.includes('profitablecpm') && !url.hostname.includes('network.com')) {
          toast.warning("Warning: That doesn't look like a standard Adsterra Smart Link.", { duration: 6000 })
        }
      } catch (e) {
        toast.error("Please enter a valid URL format.")
        return;
      }
    } else if (provider === "monetag" && adType === "direct_link" && adCode.trim()) {
      try {
        const url = new URL(adCode.trim());
        if (!url.hostname.includes('omg10.com') && !url.hostname.includes('monetag')) {
          toast.warning("Tip: Monetag Direct Links often contain 'omg10.com'.", { duration: 6000 })
        }
      } catch (e) {
        toast.error("Please enter a valid URL format.")
        return;
      }
    }

    setIsSaving(true)
    try {
      const saved = await adsApi.saveSettings({ provider, adType, adCode: adCode.trim(), isActive })
      setAllConfigs(prev => {
        const other = prev.filter(c => c.provider !== provider)
        return [...other, saved]
      })
      toast.success("Ad configuration saved successfully!")
      setIsDialogOpen(false)
    } catch (e) {
      toast.error("Failed to save ad configuration")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <RiLoader4Line className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-1">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Ads Settings</h1>
          <p className="text-muted-foreground">
            Configure your Ads Toolkit and monetize your content with top ad networks.
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button size="lg" className="shadow-lg shadow-primary/20 transition-all active:scale-95" onClick={() => {
            setProvider("adsterra");
            setAdType("smart_link");
            setAdCode("");
            setIsActive(true);
            setIsDialogOpen(true);
          }}>
            <RiAddLine className="mr-2 size-5" />
            Create Campaign
          </Button>

          <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-primary/10 shadow-2xl">
            <DialogHeader className="p-8 bg-muted/40 border-b text-left">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <RiAdvertisementLine className="size-6 text-primary" />
                </div>
                <div className="space-y-0.5">
                  <DialogTitle className="text-xl">Ads Toolkit Setup</DialogTitle>
                  <DialogDescription>Configure your provider and placement details below.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="p-8 space-y-8">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ad Provider</Label>
                  <Select value={provider} onValueChange={handleProviderChange}>
                    <SelectTrigger className="w-full bg-muted/20">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adsterra">Adsterra</SelectItem>
                      <SelectItem value="monetag">Monetag</SelectItem>
                      <SelectItem value="shopee">Shopee Affiliate</SelectItem>
                      <SelectItem value="tiktok">TikTok Affiliate</SelectItem>
                      <SelectItem value="direct">Direct Link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Format / Placement</Label>
                  <Select value={adType} onValueChange={setAdType}>
                    <SelectTrigger className="w-full bg-muted/20">
                      <SelectValue placeholder="Select ad format" />
                    </SelectTrigger>
                    <SelectContent>
                      {provider === "adsterra" ? (
                        <SelectItem value="smart_link">Smart Link</SelectItem>
                      ) : provider === "monetag" ? (
                        <SelectItem value="direct_link">Direct Link</SelectItem>
                      ) : provider === "shopee" || provider === "tiktok" || provider === "direct" ? (
                        <SelectItem value="direct_link">Direct Link (URL)</SelectItem>
                      ) : (
                        <>
                          <SelectItem value="popunder">Popunder</SelectItem>
                          <SelectItem value="instream">In-Stream Video (Pre-roll)</SelectItem>
                          <SelectItem value="banner_300">Banner (300x250)</SelectItem>
                          <SelectItem value="social_bar">Social Bar</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {provider === "shopee" || provider === "tiktok" || provider === "direct" || (provider === "adsterra" && adType === "smart_link") || (provider === "monetag" && adType === "direct_link") ? (
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {provider === "adsterra" ? "Smart Link URL" : provider === "monetag" ? "Direct Link URL" : provider === "shopee" ? "Shopee Affiliate Link" : provider === "tiktok" ? "TikTok Affiliate Link" : "Ad URL Endpoint"}
                  </Label>
                  <Input 
                    className="bg-muted/20"
                    placeholder="https://..." 
                    value={adCode}
                    onChange={(e) => setAdCode(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground italic px-1">
                    {provider === "shopee" || provider === "tiktok" ? "PASTE YOUR AFFILIATE PRODUCT LINK HERE." : "PASTE THE DIRECT LINK URL FROM YOUR DASHBOARD."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">JavaScript Ad Code</Label>
                  <Textarea 
                    placeholder="Paste your ad scripts here..." 
                    className="h-32 font-mono text-xs bg-muted/20"
                    value={adCode}
                    onChange={(e) => setAdCode(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-primary/5 p-5 bg-primary/[0.02]">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Enable Placement</Label>
                  <p className="text-xs text-muted-foreground leading-tight">If disabled, this ad unit will not be visible to viewers.</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <DialogFooter className="bg-muted/40 p-8 border-t">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancel</Button>
              <Button size="lg" onClick={handleSave} disabled={isSaving} className="px-8 shadow-md">
                {isSaving ? <RiLoader4Line className="mr-2 size-4 animate-spin" /> : <RiSave3Line className="mr-2 size-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Main Column - Table */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <RiGlobalLine className="size-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Active Placements</h3>
          </div>
          
          <Card className="overflow-hidden border-primary/10 bg-background/50 backdrop-blur-md shadow-2xl">
            <Table>
              <TableHeader className="bg-muted/50 border-b border-border/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[160px] text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground py-5 px-6">Network</TableHead>
                  <TableHead className="text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground py-5">Format</TableHead>
                  <TableHead className="text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground py-5">Integration Link</TableHead>
                  <TableHead className="w-[120px] text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground py-5 text-center">Status</TableHead>
                  <TableHead className="w-[80px] text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground py-5 text-right px-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allConfigs.length > 0 ? (
                  allConfigs.map((cfg, idx) => (
                    <TableRow key={idx} className="group hover:bg-primary/[0.02] transition-colors border-border/40">
                      <TableCell className="py-6 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl transition-colors ${cfg.isActive ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-muted border border-border/50'}`}>
                            <RiGlobalLine className={`size-4 ${cfg.isActive ? "text-emerald-500" : "text-muted-foreground"}`} />
                          </div>
                          <span className="font-bold text-sm tracking-tight capitalize">{cfg.provider}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-6">
                        <Badge variant="secondary" className="bg-primary/5 text-primary border border-primary/10 capitalize text-[10px] font-bold px-2 py-1 rounded-md">
                          {cfg.adType.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-6">
                        <div className="max-w-[280px] lg:max-w-[320px] truncate font-mono text-[10px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/20 group-hover:border-primary/20 transition-all">
                          {cfg.adCode}
                        </div>
                      </TableCell>
                      <TableCell className="py-6 text-center">
                        {cfg.isActive ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Active</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border/50">
                            <div className="size-1.5 rounded-full bg-muted-foreground/50" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Paused</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-6 text-right px-6">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-9 w-9 rounded-xl border-border/60 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all shadow-sm"
                          onClick={() => {
                            setProvider(cfg.provider);
                            setAdType(cfg.adType);
                            setAdCode(cfg.adCode);
                            setIsActive(cfg.isActive);
                            setIsDialogOpen(true);
                          }}
                        >
                          <RiEditLine className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-4 opacity-40">
                        <RiAdvertisementLine className="size-12" />
                        <p className="text-sm font-medium italic">No active ad configurations yet.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <RiAddLine className="size-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Resources</h3>
          </div>

          <Card className="bg-card/30 backdrop-blur-sm border-primary/10 shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary/80">Publisher Toolkit</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Network Registration</p>
                <div className="grid gap-3">
                  <a href="https://beta.publishers.adsterra.com/referral/A9DYAWgdC1" className="flex items-center justify-between p-3 rounded-xl bg-primary/[0.03] hover:bg-primary/[0.08] border border-primary/10 transition-all hover:translate-x-1 group" target="_blank" rel="noreferrer">
                    <span className="text-xs font-bold">Adsterra Network</span>
                    <RiAddLine className="size-4 text-primary transition-transform group-hover:rotate-90" />
                  </a>
                  <a href="https://monetag.com/?ref_id=zsAq" className="flex items-center justify-between p-3 rounded-xl bg-primary/[0.03] hover:bg-primary/[0.08] border border-primary/10 transition-all hover:translate-x-1 group" target="_blank" rel="noreferrer">
                    <span className="text-xs font-bold">Monetag Ads</span>
                    <RiAddLine className="size-4 text-primary transition-transform group-hover:rotate-90" />
                  </a>
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-border/50">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Guided Tutorials</p>
                <div className="space-y-3">
                  <a href="/blog/how-to-integrate-adsterra-smart-link" className="flex items-center gap-3 text-xs font-medium text-muted-foreground hover:text-primary transition-colors group">
                    <div className="size-1.5 rounded-full bg-primary/30 group-hover:bg-primary transition-colors" />
                    Adsterra Smart Link Guide
                  </a>
                  <a href="/blog/how-to-integrate-monetag-direct-link" className="flex items-center gap-3 text-xs font-medium text-muted-foreground hover:text-primary transition-colors group">
                    <div className="size-1.5 rounded-full bg-primary/30 group-hover:bg-primary transition-colors" />
                    Monetag Direct Link Guide
                  </a>
                  <a href="/blog/optimizing-video-ads-revenue" className="flex items-center gap-3 text-xs font-medium text-muted-foreground hover:text-primary transition-colors group">
                    <div className="size-1.5 rounded-full bg-primary/30 group-hover:bg-primary transition-colors" />
                    Revenue Optimization Best Practices
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-6 shadow-lg shadow-amber-500/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 -mr-6 -mt-6 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors" />
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <RiInformationLine className="size-5 text-amber-600 dark:text-amber-500" />
                </div>
                <h4 className="text-xs font-black text-amber-800 dark:text-amber-500 uppercase tracking-widest">Revenue Integrity</h4>
              </div>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-500/70 leading-relaxed text-justify font-medium italic">
                Our Ads Toolkit ensures 100% transparency with direct integrations. No middle-man cuts, no hidden fees. You own your revenue entirely.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/10 bg-primary/[0.02] p-8 mt-4 border-dashed">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <RiInformationLine className="size-8 text-primary" />
          </div>
          <div className="space-y-3">
            <h4 className="text-lg font-bold tracking-tight uppercase text-primary/90">The Vercelplay Commitment to Creators</h4>
            <p className="text-sm text-muted-foreground leading-relaxed text-justify">
              Direct implementation of ad providers ensures your revenue streams remain completely transparent with zero hidden reports or middle-man cuts. On the contrary, we strongly believe that granting you direct access to your preferred external partners is the only way to ensure you retain <strong>100% of your rightful earnings</strong>. We provide these professional-grade tools to empower your creativity, not to profit from it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
