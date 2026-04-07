"use client";
import { Brain, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useState } from "react";
import type { HeatEngineStatus } from "@/lib/supabase";

interface Props {
  status: HeatEngineStatus;
  onCycleTriggered: () => void;
}

export function AiBrain({ status, onCycleTriggered }: Props) {
  const [cycling, setCycling] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const period = status.is_night ? "Night" : "Day";
  const periodColor = status.is_night ? "text-indigo-400" : "text-amber-400";

  const lastEval = status.last_eval
    ? new Date(status.last_eval).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  async function handleCycle() {
    setCycling(true);
    try {
      await api.cycle();
      setTimeout(() => { setCycling(false); onCycleTriggered(); }, 3000);
    } catch { setCycling(false); }
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const data = await api.askWhy(question);
      setAnswer(data.answer ?? "No answer returned.");
    } catch (e) {
      setAnswer("Failed to reach AI.");
    } finally { setAsking(false); }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="font-semibold text-sm">AI Heat Engine</span>
          <Badge variant={status.enabled ? "default" : "secondary"} className="text-xs">
            {status.enabled ? "Active" : "Paused"}
          </Badge>
          <Badge variant="outline" className={`text-xs ${periodColor} border-current`}>
            {period}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Last run {lastEval}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCycle} disabled={cycling}>
            <Zap className="h-3 w-3" />
            {cycling ? "Running…" : "Run now"}
          </Button>
        </div>
      </div>

      {/* AI Reasoning — the hero */}
      {status.last_reasoning && (
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground/90">{status.last_reasoning}</p>
        </div>
      )}

      {/* Suggestion */}
      {status.last_suggestion && (
        <div className="px-5 pb-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-sm text-amber-200">
            <span className="font-medium">Tip: </span>{status.last_suggestion}
          </div>
        </div>
      )}

      {/* Ask AI */}
      <div className="border-t border-border/40 px-5 py-3">
        {!askOpen ? (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setAskOpen(true)}
          >
            Ask the AI why something is set the way it is…
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. Why is Master Bed at 5%?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAsk()}
              />
              <Button size="sm" className="h-8" onClick={handleAsk} disabled={asking || !question.trim()}>
                {asking ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Ask"}
              </Button>
            </div>
            {answer && (
              <p className="text-sm text-foreground/80 bg-muted/40 rounded-md px-3 py-2">{answer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
