"use client";

// Browser preferences that do not change shared game state.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/use-settings";
import { useSound } from "@/lib/use-sound";
import {
  Sparkles,
  Volume2,
  Bell,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

type ToggleDef = {
  key: keyof typeof DEFAULT_SETTINGS;
  label: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
};

const TOGGLES: ToggleDef[] = [
  {
    key: "reduceMotion",
    label: "Reduce motion",
    desc: "Skip animated transitions and count up effects. Your operating system preference is honored by default, and this setting keeps motion reduced.",
    icon: Sparkles,
    tone: "text-violet-500",
  },
  {
    key: "soundEnabled",
    label: "Sound effects",
    desc: "Play subtle sounds for controls, notices, voyage events, and Renown gains. Audio is created in the browser.",
    icon: Volume2,
    tone: "text-teal-500",
  },
  {
    key: "showOnlineToasts",
    label: "Captain online toasts",
    desc: "Show a toast whenever another captain enters the harbor. Disable if the lobby feels chatty.",
    icon: Bell,
    tone: "text-sky-500",
  },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { settings, update, reset } = useSettings();
  const { play } = useSound();

  const handleToggle = (key: keyof typeof DEFAULT_SETTINGS, v: boolean) => {
    update({ [key]: v });
    if (key === "soundEnabled" && v) {
      setTimeout(() => play("toggle"), 0);
    } else if (key !== "soundEnabled") {
      play("toggle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Captain&apos;s Preferences
          </DialogTitle>
          <DialogDescription>
            Tune the harbor to your taste. Saved to this browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-1">
          {TOGGLES.map((t) => {
            const Icon = t.icon;
            const checked = settings[t.key];
            return (
              <div
                key={t.key}
                className="flex items-start gap-3 p-3 rounded-xl border border-black/5 dark:border-white/10 bg-background/60 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className={`h-4 w-4 ${t.tone}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">
                    {t.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {t.desc}
                  </div>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(v) => handleToggle(t.key, v)}
                  aria-label={t.label}
                  className="shrink-0 mt-1"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-1 grid grid-cols-1 gap-2 border-t border-black/5 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] dark:border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              toast("Preferences reset to defaults");
            }}
            className="w-full justify-center text-muted-foreground hover:text-foreground sm:w-auto sm:justify-start"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="pm-grad-primary w-full text-white sm:w-auto"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
