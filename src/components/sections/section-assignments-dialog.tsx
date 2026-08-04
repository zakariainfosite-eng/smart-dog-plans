import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { updateAgent, type AgentRow, type SectionWithAgentCount } from "@/integrations/database";
import {
  agentWriteWithSection,
  canAssignAgentToSection,
  personnelStatusLabel,
} from "@/lib/section-assignments";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY } from "@/lib/agent-exclusions";
import { useI18n } from "@/hooks/use-i18n";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchField } from "@/components/enterprise/search-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SectionAssignmentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SectionWithAgentCount | null;
  sections: SectionWithAgentCount[];
  agents: AgentRow[];
  exclusions: AgentExclusionRecord[];
  referenceISO: string;
};

function invalidateSectionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["sections-with-counts"] });
  queryClient.invalidateQueries({ queryKey: ["sections"] });
  queryClient.invalidateQueries({ queryKey: ["agents"] });
  queryClient.invalidateQueries({ queryKey: ["agents-full"] });
  queryClient.invalidateQueries({ queryKey: ["agents-basic"] });
  queryClient.invalidateQueries({ queryKey: ["agents-basic-exclusions"] });
  queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["operational-summary"] });
}

export function SectionAssignmentsDialog({
  open,
  onOpenChange,
  section,
  sections,
  agents,
  exclusions,
  referenceISO,
}: SectionAssignmentsDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<"members" | "pool" | null>(null);

  const assignable = useMemo(
    () => agents.filter(canAssignAgentToSection),
    [agents],
  );

  const members = useMemo(() => {
    if (!section) return [];
    return assignable
      .filter((agent) => agent.section_id === section.id)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [assignable, section]);

  const pool = useMemo(() => {
    if (!section) return [];
    const q = search.trim().toLowerCase();
    return assignable
      .filter((agent) => agent.section_id !== section.id)
      .filter((agent) => {
        if (!q) return true;
        const hay =
          `${agent.first_name} ${agent.last_name} ${agent.professional_number}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [assignable, section, search]);

  const assignMutation = useMutation({
    mutationFn: async ({
      agentIds,
      sectionId,
    }: {
      agentIds: string[];
      sectionId: string | null;
    }) => {
      for (const id of agentIds) {
        const agent = agents.find((row) => row.id === id);
        if (!agent) continue;
        if (sectionId && !canAssignAgentToSection(agent)) {
          throw new Error(t("sections.assignments.error.notAssignable"));
        }
        await updateAgent(id, agentWriteWithSection(agent, sectionId));
      }
    },
    onSuccess: (_d, vars) => {
      const count = vars.agentIds.length;
      if (vars.sectionId == null) {
        toast.success(t("sections.assignments.toast.removed", { count }));
      } else if (vars.sectionId === section?.id) {
        toast.success(t("sections.assignments.toast.assigned", { count }));
      } else {
        toast.success(t("sections.assignments.toast.moved", { count }));
      }
      setSelectedIds(new Set());
      setMoveTarget("");
      invalidateSectionQueries(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedInMembers = members.filter((agent) => selectedIds.has(agent.id));
  const selectedInPool = pool.filter((agent) => selectedIds.has(agent.id));

  const assignSelectedToSection = () => {
    if (!section || selectedInPool.length === 0) return;
    assignMutation.mutate({
      agentIds: selectedInPool.map((agent) => agent.id),
      sectionId: section.id,
    });
  };

  const removeSelectedFromSection = () => {
    if (selectedInMembers.length === 0) return;
    assignMutation.mutate({
      agentIds: selectedInMembers.map((agent) => agent.id),
      sectionId: null,
    });
  };

  const moveSelectedToTarget = () => {
    if (!moveTarget || selectedIds.size === 0) return;
    const sectionId = moveTarget === "__none__" ? null : moveTarget;
    assignMutation.mutate({
      agentIds: [...selectedIds],
      sectionId,
    });
  };

  const onDropToMembers = (agentId: string) => {
    if (!section) return;
    assignMutation.mutate({ agentIds: [agentId], sectionId: section.id });
  };

  const onDropToPool = (agentId: string) => {
    assignMutation.mutate({ agentIds: [agentId], sectionId: null });
  };

  const renderAgentRow = (
    agent: AgentRow,
    zone: "members" | "pool",
  ) => {
    const status = personnelStatusLabel(agent, exclusions, referenceISO, t);
    const sectionName =
      agent.section_id == null
        ? t("sections.assignments.unassigned")
        : sections.find((s) => s.id === agent.section_id)?.name ?? "—";

    return (
      <li
        key={agent.id}
        draggable
        onDragStart={() => setDraggingId(agent.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setDropZone(null);
        }}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-2",
          draggingId === agent.id && "opacity-60",
        )}
      >
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
        <Checkbox
          checked={selectedIds.has(agent.id)}
          onCheckedChange={(value) => toggleSelected(agent.id, value === true)}
          aria-label={t("sections.assignments.selectPerson")}
        />
        <AgentAvatar
          firstName={agent.first_name}
          lastName={agent.last_name}
          photoUrl={agent.photo_url}
          className="h-8 w-8 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {agent.first_name} {agent.last_name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {agent.professional_number}
            {" · "}
            {status}
            {zone === "pool" ? ` · ${sectionName}` : ""}
          </p>
        </div>
        {zone === "pool" && section ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={assignMutation.isPending}
            onClick={() =>
              assignMutation.mutate({ agentIds: [agent.id], sectionId: section.id })
            }
            aria-label={t("sections.assignments.assignOne")}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            disabled={assignMutation.isPending}
            onClick={() =>
              assignMutation.mutate({ agentIds: [agent.id], sectionId: null })
            }
            aria-label={t("sections.assignments.removeOne")}
          >
            <UserMinus className="h-4 w-4" />
          </Button>
        )}
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelectedIds(new Set());
          setSearch("");
          setMoveTarget("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[min(92vh,820px)] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-5 pr-14">
          <DialogTitle>
            {t("sections.assignments.title", { name: section?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("sections.assignments.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/10 px-6 py-3">
          <Select value={moveTarget || undefined} onValueChange={setMoveTarget}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder={t("sections.assignments.moveTo")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t("sections.assignments.unassigned")}
              </SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={selectedIds.size === 0 || !moveTarget || assignMutation.isPending}
            onClick={moveSelectedToTarget}
          >
            {t("sections.assignments.applyMove")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedInPool.length === 0 || assignMutation.isPending}
            onClick={assignSelectedToSection}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            {t("sections.assignments.assignSelected")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedInMembers.length === 0 || assignMutation.isPending}
            onClick={removeSelectedFromSection}
          >
            <UserMinus className="mr-1.5 h-3.5 w-3.5" />
            {t("sections.assignments.removeSelected")}
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
          <section
            className={cn(
              "flex min-h-0 flex-col border-b border-border/60 md:border-b-0 md:border-r",
              dropZone === "members" && "bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDropZone("members");
            }}
            onDragLeave={() => setDropZone((z) => (z === "members" ? null : z))}
            onDrop={(e) => {
              e.preventDefault();
              setDropZone(null);
              if (draggingId) onDropToMembers(draggingId);
            }}
          >
            <div className="shrink-0 px-4 py-3">
              <h3 className="text-sm font-semibold">
                {t("sections.assignments.members", { count: members.length })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("sections.assignments.dropHereAssign")}
              </p>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
              {members.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("sections.detail.emptyMembers")}
                </li>
              ) : (
                members.map((agent) => renderAgentRow(agent, "members"))
              )}
            </ul>
          </section>

          <section
            className={cn(
              "flex min-h-0 flex-col",
              dropZone === "pool" && "bg-destructive/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDropZone("pool");
            }}
            onDragLeave={() => setDropZone((z) => (z === "pool" ? null : z))}
            onDrop={(e) => {
              e.preventDefault();
              setDropZone(null);
              if (draggingId) onDropToPool(draggingId);
            }}
          >
            <div className="shrink-0 space-y-2 px-4 py-3">
              <h3 className="text-sm font-semibold">
                {t("sections.assignments.availablePool")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("sections.assignments.dropHereRemove")}
              </p>
              <SearchField
                placeholder={t("exclusions.searchAgent")}
                value={search}
                onChange={setSearch}
              />
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
              {pool.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("sections.assignments.emptyPool")}
                </li>
              ) : (
                pool.map((agent) => renderAgentRow(agent, "pool"))
              )}
            </ul>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4">
          <p className="mr-auto text-xs text-muted-foreground">
            {t("sections.assignments.safetyNote")}
          </p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("sections.detail.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
