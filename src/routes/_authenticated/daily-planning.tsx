import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { translatePlanningReason, isReserveWarning, isRestWarning, translatePoint653Reason } from "@/lib/planning-i18n";
import {
  collectPlanningResultAgentNames,
  filterPlanningWarningsForSelectedSection,
} from "@/lib/planning/filter-planning-warnings";
import {
  CalendarDays,
  Dog as DogIcon,
  AlertTriangle,
  MapPin,
  Moon,
  Sun,
  UserX,
  Users,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  FileDown,
  FileText,
  Files,
} from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { db } from "@/integrations/database/client";
import { getSections } from "@/integrations/database";
import {
  fetchActiveExclusionsForDate,
  isAgentLevelExclusionType,
} from "@/lib/agent-exclusions";
import { OPERATIONAL_SUMMARY_QUERY_KEY } from "@/lib/dashboard/fetch-operational-summary";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportFeuillePresencePlanning,
  planningExportBasename,
} from "@/lib/documents/planning-export";
import { formatUnknownError, stackUnknownError } from "@/lib/documents/export-error";
import type { PlanningExportFormat } from "@/lib/documents/planning-export-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RotationShift } from "@/lib/planning/section-rotation";
import { loadPlanningContext } from "@/lib/planning/load-planning-context";
import {
  runPlanningEngine,
  type CheckpointAssignment,
  type PlanningEngineResult,
} from "@/lib/planning/engine";
import { downloadFeuillePresencePdfWithLogo } from "@/lib/documents/feuille-presence-pdf";
import {
  buildFeuillePresenceData,
  collectFeuillePresenceMetaAgentIds,
  type FeuillePresenceAgentMeta,
} from "@/lib/documents/build-feuille-presence-data";
import { loadActiveFemaleAgentsForPresence } from "@/lib/documents/build-cynotechniciennes-presence-data";
import { resolveAttendanceSheetCommander } from "@/lib/documents/resolve-attendance-sheet-commander";
import { compareMatriculeAsc } from "@/lib/documents/sort-attendance-by-matricule";

export const Route = createFileRoute("/_authenticated/daily-planning")({
  head: () => ({ meta: [{ title: "Planification quotidienne — CynoPlanning" }] }),
  component: DailyPlanningPage,
});

const SECTION_ROLE_STORAGE_KEY = "cynoplanning.daily-planning.section-shift-roles";
const ALL_SECTION_ROLES: RotationShift[] = ["day", "night", "rest"];

type SectionRoleMap = Record<string, RotationShift>;

function isSectionRole(value: unknown): value is RotationShift {
  return value === "day" || value === "night" || value === "rest";
}

function isValidSectionRoleMap(map: SectionRoleMap, sectionIds: string[]): boolean {
  if (sectionIds.length !== 3) return false;
  const roles = sectionIds.map((id) => map[id]);
  if (!roles.every(isSectionRole)) return false;
  return new Set(roles).size === 3;
}

function defaultSectionRoleMap(sectionIds: string[]): SectionRoleMap {
  return Object.fromEntries(
    sectionIds.map((id, index) => [id, ALL_SECTION_ROLES[index] ?? "rest"]),
  );
}

function loadStoredSectionRoleMap(sectionIds: string[]): SectionRoleMap {
  if (typeof window === "undefined") return defaultSectionRoleMap(sectionIds);
  try {
    const raw = window.localStorage.getItem(SECTION_ROLE_STORAGE_KEY);
    if (!raw) return defaultSectionRoleMap(sectionIds);
    const parsed = JSON.parse(raw) as SectionRoleMap;
    if (isValidSectionRoleMap(parsed, sectionIds)) return parsed;
  } catch {
    // Ignore corrupt storage and fall back to defaults.
  }
  return defaultSectionRoleMap(sectionIds);
}

function persistSectionRoleMap(map: SectionRoleMap, sectionIds: string[]) {
  if (typeof window === "undefined") return;
  if (!isValidSectionRoleMap(map, sectionIds)) return;
  try {
    window.localStorage.setItem(SECTION_ROLE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

type PlanningErrorDisplay =
  | {
      kind: "database";
      message: string;
      code: string;
      details: string;
      hint: string;
    }
  | {
      kind: "other";
      stack: string;
    };

function formatPlanningError(error: unknown): PlanningErrorDisplay {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    if ("message" in err || "code" in err) {
      return {
        kind: "database",
        message: String(err.message ?? ""),
        code: String(err.code ?? ""),
        details: String(err.details ?? ""),
        hint: String(err.hint ?? ""),
      };
    }
  }
  if (error instanceof Error) {
    return { kind: "other", stack: error.stack ?? error.message };
  }
  return { kind: "other", stack: String(error) };
}

function DailyPlanningPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  useDocumentTitle("meta.dailyPlanning.title");
  const [shiftChoice, setShiftChoice] = useState<"day" | "night">("day");
  const [planningDate, setPlanningDate] = useState<Date>(new Date());
  const [roleBySectionId, setRoleBySectionId] = useState<SectionRoleMap>({});
  const [result, setResult] = useState<PlanningEngineResult | null>(null);
  /** Section id that produced `result` — used so UI never shows another section's warnings. */
  const [resultSectionId, setResultSectionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [planningError, setPlanningError] = useState<PlanningErrorDisplay | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{ existingId: string } | null>(null);

  // Same IPC data source as the working Sections page (getSections), not REST.
  const {
    data: sections,
    isLoading: sectionsLoading,
    error: sectionsQueryError,
  } = useQuery({
    queryKey: ["sections", "active", "rotation"],
    queryFn: async () => {
      const rows = await getSections();
      return rows
        .filter((row) => row.active)
        .map((row) => ({
          id: row.id,
          name: row.name,
          shift_type: row.shift_type,
          active: row.active,
          commander_full_name: row.commander_full_name,
          commander_grade: row.commander_grade,
          commander_mle: row.commander_mle,
        }));
    },
  });

  useEffect(() => {
    if (!sectionsQueryError) return;
    console.error("[daily-planning] sections query failed:", sectionsQueryError);
    setPlanningError(formatPlanningError(sectionsQueryError));
  }, [sectionsQueryError]);

  const orderedSections = useMemo(() => {
    if (!sections) return [];
    // Keep stable 1ère / 2ème / 3ème order by name (same as former rotation slots).
    return [...sections]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .slice(0, 3)
      .map((section, index) => ({
        id: section.id,
        name: section.name,
        commander_full_name: section.commander_full_name ?? "",
        commander_grade: section.commander_grade ?? "",
        commander_mle: section.commander_mle ?? "",
        index,
      }));
  }, [sections]);

  const orderedSectionIds = useMemo(
    () => orderedSections.map((section) => section.id),
    [orderedSections],
  );

  useEffect(() => {
    if (orderedSectionIds.length !== 3) {
      setRoleBySectionId({});
      return;
    }
    setRoleBySectionId((prev) => {
      if (isValidSectionRoleMap(prev, orderedSectionIds)) return prev;
      return loadStoredSectionRoleMap(orderedSectionIds);
    });
  }, [orderedSectionIds]);

  useEffect(() => {
    if (orderedSectionIds.length !== 3) return;
    persistSectionRoleMap(roleBySectionId, orderedSectionIds);
  }, [roleBySectionId, orderedSectionIds]);

  const rolesValid = isValidSectionRoleMap(roleBySectionId, orderedSectionIds);

  const scheduleList = useMemo(
    () =>
      orderedSections.map((section) => ({
        ...section,
        rotationShift: roleBySectionId[section.id] as RotationShift | undefined,
      })),
    [orderedSections, roleBySectionId],
  );

  const selectedSection = useMemo(() => {
    if (!rolesValid) return undefined;
    return scheduleList.find((section) => section.rotationShift === shiftChoice);
  }, [rolesValid, scheduleList, shiftChoice]);

  const sectionId = selectedSection?.id ?? "";
  const shift = selectedSection ? shiftChoice : undefined;

  const handleSectionRoleChange = (sectionIdToChange: string, nextRole: RotationShift) => {
    setRoleBySectionId((prev) => {
      const currentRole = prev[sectionIdToChange];
      if (!currentRole || currentRole === nextRole) {
        return { ...prev, [sectionIdToChange]: nextRole };
      }
      const next: SectionRoleMap = { ...prev, [sectionIdToChange]: nextRole };
      const otherId = Object.keys(prev).find(
        (id) => id !== sectionIdToChange && prev[id] === nextRole,
      );
      if (otherId) next[otherId] = currentRole;
      return next;
    });
  };

  // Drop stale results when the selected section / date / shift changes so
  // warnings from 2ème / 3ème never linger while viewing 1ère (and vice versa).
  useEffect(() => {
    setResult(null);
    setResultSectionId(null);
  }, [sectionId, shiftChoice, planningDate]);

  const sectionScopedResult =
    result && resultSectionId && resultSectionId === sectionId ? result : null;

  const displayWarnings = useMemo(() => {
    if (!sectionScopedResult || !selectedSection) return [];
    const otherSectionNames = scheduleList
      .filter((row) => row.id !== selectedSection.id)
      .map((row) => row.name);
    return filterPlanningWarningsForSelectedSection(sectionScopedResult.summary.warnings, {
      sectionId: selectedSection.id,
      sectionName: selectedSection.name,
      otherSectionNames,
      sectionAgentNames: collectPlanningResultAgentNames(sectionScopedResult),
    });
  }, [sectionScopedResult, selectedSection, scheduleList]);

  const persistPlanning = async (
    engineResult: PlanningEngineResult,
    replaceExistingId: string | null,
    sectionAgentIds: string[],
  ) => {
    if (!selectedSection || !shift) {
      throw new Error("persistPlanning aborted: active section/shift missing.");
    }

    const dateISO = format(planningDate, "yyyy-MM-dd");
    console.info("[daily-planning] persistPlanning", { dateISO, replaceExistingId });

    if (replaceExistingId) {
      if (sectionAgentIds.length > 0) {
        const { error: histDelError } = await db
          .from("rotation_history")
          .delete()
          .eq("planning_date", dateISO)
          .in("agent_id", sectionAgentIds);
        if (histDelError) throw histDelError;
      }

      const { error: delError } = await db
        .from("planning")
        .delete()
        .eq("id", replaceExistingId);
      if (delError) throw delError;
    }

    const { data: planningRow, error: planError } = await db
      .from("planning")
      .insert({
        planning_date: dateISO,
        section_id: selectedSection.id,
        shift,
        validated: true,
      })
      .select("id")
      .single();
    if (planError) throw planError;

    const planningId = planningRow.id;

    if (engineResult.assignments.length > 0) {
      const aRows = engineResult.assignments.map((a: any) => ({
        planning_id: planningId,
        checkpoint_post_id: a.checkpoint_post_id,
        agent_id: a.agent_id,
        dog_id: a.dog_id,
        is_hq_reserve: false,
        is_off_duty: false,
      }));
      const { error: aError } = await db.from("planning_assignments").insert(aRows);
      if (aError) throw aError;

      const hRows = engineResult.assignments.map((a: any) => ({
        agent_id: a.agent_id,
        checkpoint_post_id: a.checkpoint_post_id,
        planning_date: dateISO,
        is_hq_reserve: false,
        is_off_duty: false,
      }));
      const { error: hError } = await db.from("rotation_history").insert(hRows);
      if (hError) throw hError;
    }

    if (engineResult.point653.length > 0) {
      const reserveRows = engineResult.point653.map((entry: any) => ({
        planning_id: planningId,
        checkpoint_post_id: null,
        agent_id: entry.agent_id,
        dog_id: entry.dog_id,
        is_hq_reserve: true,
        is_off_duty: false,
      }));
      const { error: reserveError } = await db.from("planning_assignments").insert(reserveRows);
      if (reserveError) throw reserveError;

      const reserveHistory = engineResult.point653.map((entry: any) => ({
        agent_id: entry.agent_id,
        checkpoint_post_id: null,
        planning_date: dateISO,
        is_hq_reserve: true,
        is_off_duty: false,
      }));
      const { error: reserveHistError } = await db.from("rotation_history").insert(reserveHistory);
      if (reserveHistError) throw reserveHistError;
    }

    if (engineResult.offDuty.length > 0) {
      const restRows = engineResult.offDuty.map((entry: any) => ({
        planning_id: planningId,
        checkpoint_post_id: null,
        agent_id: entry.agent_id,
        dog_id: entry.dog_id,
        is_hq_reserve: false,
        is_off_duty: true,
      }));
      const { error: restError } = await db.from("planning_assignments").insert(restRows);
      if (restError) throw restError;

      const restHistory = engineResult.offDuty.map((entry: any) => ({
        agent_id: entry.agent_id,
        checkpoint_post_id: null,
        planning_date: dateISO,
        is_hq_reserve: false,
        is_off_duty: true,
      }));
      const { error: restHistError } = await db.from("rotation_history").insert(restHistory);
      if (restHistError) throw restHistError;
    }
  };

  const executePlanning = async (replaceExistingId: string | null) => {
    console.info("[daily-planning] executePlanning:start", { replaceExistingId, sectionId, shift });
    if (!selectedSection || !shift) {
      const message =
        "executePlanning aborted: active section is null for the selected shift (Jour/Nuit).";
      console.error("[daily-planning]", message, { selectedSection, shiftChoice, sections });
      setPlanningError({ kind: "other", stack: message });
      return;
    }

    setRunning(true);
    setResult(null);
    setResultSectionId(null);
    setPlanningError(null);

    try {
      const dateISO = format(planningDate, "yyyy-MM-dd");
      console.info("[daily-planning] executePlanning:loadContext", dateISO);
      const ctx = await loadPlanningContext(db, dateISO, selectedSection.id, planningDate);
      console.info("[daily-planning] executePlanning:engine", {
        agents: ctx.agents.length,
        checkpoints: ctx.checkpoints.length,
      });

      const engineResult = runPlanningEngine({
        sectionId: selectedSection.id,
        agents: ctx.agents,
        exclusions: ctx.exclusions,
        exclusionDebug: ctx.exclusionDebug,
        checkpoints: ctx.checkpoints,
        shift,
        planningDate,
        rotationHistory: ctx.rotationHistory,
        yesterdayCheckpointByAgent: ctx.yesterdayCheckpointByAgent,
        fairnessCounts: ctx.fairnessCounts,
      });

      console.info("[daily-planning] executePlanning:persist", {
        assignments: engineResult.assignments.length,
        point653: engineResult.point653.length,
        offDuty: engineResult.offDuty.length,
      });
      await persistPlanning(
        engineResult,
        replaceExistingId,
        ctx.agents.map((a: any) => a.id),
      );
      // Full warnings stay on engineResult.summary for history/persistence needs.
      // UI + toast use section-scoped displayWarnings only.
      setResult(engineResult);
      setResultSectionId(selectedSection.id);
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: OPERATIONAL_SUMMARY_QUERY_KEY });

      const otherSectionNames = scheduleList
        .filter((row) => row.id !== selectedSection.id)
        .map((row) => row.name);
      const scopedWarnings = filterPlanningWarningsForSelectedSection(engineResult.summary.warnings, {
        sectionId: selectedSection.id,
        sectionName: selectedSection.name,
        otherSectionNames,
        sectionAgentNames: collectPlanningResultAgentNames(engineResult),
      });

      console.info("[daily-planning] executePlanning:success");
      if (scopedWarnings.length > 0) {
        toast.warning(t("dailyPlanning.toast.savedWithWarnings", { count: scopedWarnings.length }));
      } else {
        toast.success(t("dailyPlanning.toast.success"));
      }
    } catch (error) {
      console.error("[daily-planning] executePlanning:failed", error);
      setPlanningError(formatPlanningError(error));
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const handleCreatePlanning = async () => {
    console.info("[daily-planning] 1.onClick → handleCreatePlanning", {
      sectionId,
      shift,
      shiftChoice,
      sectionsLoading,
      sectionsCount: sections?.length ?? null,
    });

    try {
      if (!rolesValid) {
        const message = t("dailyPlanning.alert.invalidSectionRoles");
        setPlanningError({ kind: "other", stack: message });
        toast.error(message);
        return;
      }

      if (!selectedSection || !shift) {
        const message =
          "No active section for the selected shift. Assign exactly one section to Jour and one to Nuit.";
        console.error("[daily-planning] 3.validation SILENT-WOULD-RETURN → exposing error", {
          selectedSection,
          shift,
          roleBySectionId,
        });
        setPlanningError({ kind: "other", stack: message });
        toast.error(message);
        return;
      }

      console.info("[daily-planning] 3.validation ok / 4.activeSection", {
        id: selectedSection.id,
        name: selectedSection.name,
        shift,
      });
      setPlanningError(null);

      const dateISO = format(planningDate, "yyyy-MM-dd");
      console.info("[daily-planning] 5.existingCheck", { dateISO, sectionId: selectedSection.id, shift });

      const existingResult = await db
        .from("planning")
        .select("id")
        .eq("section_id", selectedSection.id)
        .eq("planning_date", dateISO)
        .eq("shift", shift)
        .maybeSingle();

      if (!existingResult || typeof existingResult !== "object") {
        throw new Error(
          `Planning existing-check returned invalid IPC result: ${String(existingResult)}`,
        );
      }

      const { data: existing, error } = existingResult;

      if (error) {
        console.error("[daily-planning] 5.existingCheck error", error);
        setPlanningError(formatPlanningError(error));
        toast.error(error.message ?? String(error));
        return;
      }

      if (existing?.id) {
        console.info(
          "[daily-planning] 6.existingFound → open replace dialog",
          existing.id,
        );
        setConfirmReplace({ existingId: existing.id });
        return;
      }

      console.info("[daily-planning] 6.noExisting → executePlanning");
      await executePlanning(null);
    } catch (error) {
      // Previously uncaught → click appeared to do nothing (no dialog, no toast).
      console.error("[daily-planning] handleCreatePlanning REJECTED", error);
      setPlanningError(formatPlanningError(error));
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const checkpointsWithDemand =
    sectionScopedResult?.checkpoints.filter((c: any) => c.total_required > 0) ?? [];

  const prepareFeuillePresence = async () => {
    if (!sectionScopedResult || !selectedSection || !shift) {
      toast.error(t("dailyPlanning.attendanceSheet.noPlanning"));
      return null;
    }

    const commanderFullName = selectedSection.commander_full_name?.trim() ?? "";
    const commanderGrade = selectedSection.commander_grade?.trim() ?? "";
    const commanderMle = selectedSection.commander_mle?.trim() ?? "";
    if (!commanderFullName || !commanderGrade || !commanderMle) {
      toast.error(t("dailyPlanning.attendanceSheet.missingCommander"));
      return null;
    }

    const metaAgentIds = collectFeuillePresenceMetaAgentIds(sectionScopedResult);

    let agentsMeta: FeuillePresenceAgentMeta[] = [];
    if (metaAgentIds.length > 0) {
      const { data: agentsRaw, error } = await db
        .from("agents")
        .select(
          "id, first_name, last_name, professional_number, grade, dogs:dog_id(name, specialty)",
        )
        .in("id", metaAgentIds);

      if (error) throw error;

      agentsMeta = (agentsRaw ?? []).map((row: any) => {
        const dogs = row.dogs;
        const dog = Array.isArray(dogs) ? dogs[0] : dogs;
        const specialty = dog?.specialty;
        return {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          professional_number: row.professional_number,
          grade: row.grade,
          is_section_chief: false,
          dog_name: dog?.name ?? null,
          dog_specialty:
            specialty === "narcotics" || specialty === "explosives" ? specialty : null,
        };
      });
    }

    // Attendance PDF: exclusion effectiveness uses the selected planning date.
    const exclusionsRaw = await fetchActiveExclusionsForDate(
      db,
      format(planningDate, "yyyy-MM-dd"),
    );
    const exclusionTypesByAgent: Record<string, string> = {};
    for (const exclusion of exclusionsRaw) {
      if (!exclusion.agent_id || !metaAgentIds.includes(exclusion.agent_id)) continue;
      if (!isAgentLevelExclusionType(exclusion.exclusion_type)) continue;
      exclusionTypesByAgent[exclusion.agent_id] = exclusion.exclusion_type;
    }

    const resolvedCommander = await resolveAttendanceSheetCommander(
      db,
      selectedSection.id,
      {
        fullName: commanderFullName,
        grade: commanderGrade,
        mle: commanderMle,
      },
      exclusionsRaw,
    );

    const femaleAgents = await loadActiveFemaleAgentsForPresence(db);

    const buildResult = buildFeuillePresenceData({
      planningDate,
      shift,
      sectionName: selectedSection.name,
      sectionIndex: selectedSection.index,
      sectionCommander: {
        fullName: resolvedCommander.fullName,
        grade: resolvedCommander.grade,
        mle: resolvedCommander.mle,
        needsManualFill: resolvedCommander.needsManualFill,
        mode: resolvedCommander.mode,
      },
      agents: agentsMeta,
      femaleAgents,
      exclusionTypesByAgent,
      engineResult: sectionScopedResult,
    });

    if (!buildResult.ok) {
      toast.error(t("dailyPlanning.attendanceSheet.validationFailed"));
      return null;
    }

    return buildResult.data;
  };

  const handleDownloadAttendanceSheet = async () => {
    try {
      const data = await prepareFeuillePresence();
      if (!data) return;

      await downloadFeuillePresencePdfWithLogo({
        year: planningDate.getFullYear(),
        data,
        filename: `${planningExportBasename(planningDate)}.pdf`,
      });
      toast.success(t("dailyPlanning.attendanceSheet.success"));
    } catch {
      toast.error(t("dailyPlanning.attendanceSheet.error"));
    }
  };

  const handleExportPlanning = async (format: PlanningExportFormat) => {
    setExporting(true);
    try {
      const data = await prepareFeuillePresence();
      if (!data) return;

      const saveResult = await exportFeuillePresencePlanning(
        {
          planningDate,
          data,
          basename: planningExportBasename(planningDate),
        },
        format,
      );

      if (saveResult.canceled) {
        toast.message(t("dailyPlanning.export.canceled"));
        return;
      }

      toast.success(
        format === "both"
          ? t("dailyPlanning.export.successBoth")
          : t("dailyPlanning.export.success"),
      );
    } catch (error) {
      const detail = formatUnknownError(error);
      console.error("Planning export failed:", detail);
      console.error(stackUnknownError(error));
      toast.error(`${t("dailyPlanning.export.error")}\n${detail}`, {
        duration: 12_000,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageTitle
        icon={CalendarDays}
        title={t("dailyPlanning.title")}
        description={t("dailyPlanning.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAttendanceSheet}
              disabled={!sectionScopedResult}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {t("dailyPlanning.attendanceSheet.generate")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" disabled={!sectionScopedResult || exporting}>
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Files className="mr-2 h-4 w-4" />
                  )}
                  {t("dailyPlanning.export.menu")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={exporting}
                  onClick={() => void handleExportPlanning("pdf")}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {t("dailyPlanning.export.pdf")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={exporting}
                  onClick={() => void handleExportPlanning("docx")}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t("dailyPlanning.export.docx")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={exporting}
                  onClick={() => void handleExportPlanning("both")}
                >
                  <Files className="mr-2 h-4 w-4" />
                  {t("dailyPlanning.export.both")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <PageContentShell>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{t("dailyPlanning.create.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("dailyPlanning.create.description")}</p>
        </div>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("dailyPlanning.field.planningDate")}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(planningDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={planningDate}
                    onSelect={(d) => d && setPlanningDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("dailyPlanning.field.shift")}</label>
              <Select value={shiftChoice} onValueChange={(v) => setShiftChoice(v as "day" | "night")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("shift.dayHours")}</SelectItem>
                  <SelectItem value="night">{t("shift.nightHours")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              onClick={() => void handleCreatePlanning()}
              disabled={!sectionId || !rolesValid || running || sectionsLoading}
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("dailyPlanning.generating")}
                </>
              ) : (
                t("dailyPlanning.createButton")
              )}
            </Button>
          </div>

          {orderedSections.length === 3 && (
            <div className="space-y-2">
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
                {scheduleList.map((s) => {
                  const isSelected = s.id === sectionId;
                  const role = roleBySectionId[s.id];
                  return (
                    <div
                      key={s.id}
                      className={`flex flex-col gap-2 rounded-md border px-3 py-2 text-sm ${
                        isSelected ? "border-primary bg-primary/5" : "border-transparent"
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      <Select
                        value={role ?? ""}
                        onValueChange={(v) =>
                          handleSectionRoleChange(s.id, v as RotationShift)
                        }
                      >
                        <SelectTrigger className="h-9 bg-background">
                          <SelectValue placeholder={t("dailyPlanning.field.sectionRole")} />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_SECTION_ROLES.map((option) => (
                            <SelectItem key={option} value={option}>
                              <span className="inline-flex items-center gap-1.5">
                                {option === "night" ? (
                                  <Moon className="h-3.5 w-3.5" />
                                ) : option === "day" ? (
                                  <Sun className="h-3.5 w-3.5" />
                                ) : null}
                                {t(`shift.${option}`)}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
              {!rolesValid && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t("dailyPlanning.alert.invalidSectionRolesTitle")}</AlertTitle>
                  <AlertDescription>
                    {t("dailyPlanning.alert.invalidSectionRoles")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          {sections && sections.length < 3 && (
            <Alert variant="destructive">
              <AlertTitle>{t("dailyPlanning.alert.rotationUnavailable")}</AlertTitle>
              <AlertDescription>
                {t("dailyPlanning.alert.needThreeSections", { count: sections.length })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </PageContentShell>

      {planningError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("dailyPlanning.error.title")}</AlertTitle>
          <AlertDescription>
            {planningError.kind === "database" ? (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">
                {`${t("dailyPlanning.error.message")}\n${planningError.message}\n\n${t("dailyPlanning.error.code")}\n${planningError.code}\n\n${t("dailyPlanning.error.details")}\n${planningError.details}\n\n${t("dailyPlanning.error.hint")}\n${planningError.hint}`}
              </pre>
            ) : (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">
                {planningError.stack}
              </pre>
            )}
          </AlertDescription>
        </Alert>
      )}

      {running && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {sectionScopedResult && !running && (
        <>
          {(() => {
            const reserveWarnings = displayWarnings.filter(isReserveWarning);
            const restWarnings = displayWarnings.filter(isRestWarning);
            const criticalWarnings = displayWarnings.filter(
              (w) =>
                !isReserveWarning(w) &&
                !isRestWarning(w) &&
                (w.startsWith("CRITICAL:") || w.includes("UNDERSTAFFED") || w.includes("INVALID:")),
            );
            const infoWarnings = displayWarnings.filter((w) => w.startsWith("INFO:"));
            const operationalWarnings = displayWarnings.filter(
              (w) =>
                !isReserveWarning(w) &&
                !isRestWarning(w) &&
                !w.startsWith("CRITICAL:") &&
                !w.startsWith("INFO:") &&
                !w.includes("UNDERSTAFFED") &&
                !w.includes("INVALID:"),
            );

            return (
              <>
                {criticalWarnings.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {t("dailyPlanning.warnings.criticalTitle", {
                        count: criticalWarnings.length,
                      })}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {criticalWarnings.map((w: string, i: number) => (
                          <li key={`crit-${i}`}>{translatePlanningReason(w, t)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {operationalWarnings.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {t("dailyPlanning.warnings.title", { count: operationalWarnings.length })}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {operationalWarnings.map((w: any, i: any) => (
                          <li key={i}>{translatePlanningReason(w, t)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {infoWarnings.length > 0 && (
                  <Alert className="border-muted-foreground/20 bg-muted/40">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle>
                      {t("dailyPlanning.warnings.infoTitle", { count: infoWarnings.length })}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {infoWarnings.map((w: string, i: number) => (
                          <li key={`info-${i}`}>{translatePlanningReason(w, t)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {restWarnings.length > 0 && (
                  <Alert className="border-muted-foreground/20 bg-muted/40">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle>{t("dailyPlanning.rest.noticeTitle")}</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {restWarnings.map((w: any, i: any) => (
                          <li key={i}>{translatePlanningReason(w, t)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {reserveWarnings.length > 0 && (
                  <Alert className="border-primary/30 bg-primary/5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <AlertTitle>{t("dailyPlanning.point653.noticeTitle")}</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {reserveWarnings.map((w: any, i: any) => (
                          <li key={i}>{translatePlanningReason(w, t)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {criticalWarnings.length === 0 &&
                  operationalWarnings.length === 0 &&
                  infoWarnings.length === 0 &&
                  reserveWarnings.length === 0 &&
                  restWarnings.length === 0 && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle>{t("dailyPlanning.complete.title")}</AlertTitle>
                    <AlertDescription>
                      {t("dailyPlanning.complete.description")}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            );
          })()}

          <Card className="mb-6 border-border/60 shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("dailyPlanning.coverageReport.title")}
              </CardTitle>
              <CardDescription>
                {t("dailyPlanning.coverageReport.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    {t("dailyPlanning.coverageReport.mandatory")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {sectionScopedResult.summary.mandatoryCovered ?? 0} /{" "}
                    {sectionScopedResult.summary.mandatoryTotal ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    {t("dailyPlanning.coverageReport.optional")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {sectionScopedResult.summary.optionalCovered ?? 0} /{" "}
                    {sectionScopedResult.summary.optionalTotal ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    {t("dailyPlanning.coverageReport.critical")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                    {sectionScopedResult.summary.criticalWarnings ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    {t("dailyPlanning.coverageReport.optionalSkipped")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {sectionScopedResult.summary.optionalSkipped ?? 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
              <KpiCard label={t("dailyPlanning.stat.totalEmployees")} value={sectionScopedResult.summary.totalEmployees} icon={Users} accent="primary" />
              <KpiCard label={t("dailyPlanning.stat.assigned")} value={sectionScopedResult.summary.assignedToCheckpoints} icon={CheckCircle2} accent="success" />
              <KpiCard label={t("dailyPlanning.stat.rest")} value={sectionScopedResult.summary.restEmployees} icon={Moon} accent="primary" />
              <KpiCard label={t("dailyPlanning.stat.point653")} value={sectionScopedResult.summary.point653Employees} icon={ShieldCheck} accent="primary" />
              <KpiCard label={t("dailyPlanning.stat.fullyStaffed")} value={sectionScopedResult.summary.fullyStaffedCheckpoints} icon={MapPin} accent="success" />
              <KpiCard label={t("dailyPlanning.stat.understaffed")} value={sectionScopedResult.summary.understaffedCheckpoints} icon={AlertTriangle} accent="warning" />
              <KpiCard label={t("dailyPlanning.stat.excluded")} value={sectionScopedResult.summary.agentExclusionCount} icon={UserX} accent="danger" />
            </div>
          </div>

          <CheckpointAssignmentTable checkpoints={checkpointsWithDemand} />

          {sectionScopedResult.offDuty.length > 0 && (
            <Card className="border-muted shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Moon className="h-5 w-5 text-muted-foreground" />{" "}
                  {t("dailyPlanning.rest.title", { count: sectionScopedResult.offDuty.length })}
                </CardTitle>
                <CardDescription>{t("dailyPlanning.rest.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {[...sectionScopedResult.offDuty]
                    .sort((a: any, b: any) =>
                      compareMatriculeAsc(a.professional_number ?? "", b.professional_number ?? ""),
                    )
                    .map((entry: any) => (
                    <li key={entry.agent_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <StatusBadge tone="neutral" className="shrink-0">
                        {t("dailyPlanning.rest.badge")}
                      </StatusBadge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.professional_number}
                      </span>
                      <span className="font-medium">{entry.agent_name}</span>
                      {entry.dog_name && (
                        <span className="text-muted-foreground">· {entry.dog_name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {sectionScopedResult.point653.length > 0 && (
            <Card className="border-primary/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-primary" />{" "}
                  {t("dailyPlanning.point653.title", { count: sectionScopedResult.point653.length })}
                </CardTitle>
                <CardDescription>{t("dailyPlanning.point653.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {[...sectionScopedResult.point653]
                    .sort((a: any, b: any) =>
                      compareMatriculeAsc(a.professional_number ?? "", b.professional_number ?? ""),
                    )
                    .map((entry: any) => (
                    <li key={entry.agent_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <StatusBadge tone="primary" className="shrink-0">
                        {t("dailyPlanning.point653.badge")}
                      </StatusBadge>
                      <span className="font-mono text-xs text-muted-foreground">
                        #{entry.professional_number}
                      </span>
                      <span className="font-medium">{entry.agent_name}</span>
                      {entry.specialty ? (
                        <Badge variant="outline" className="capitalize">
                          {t(`specialty.${entry.specialty}`)}
                        </Badge>
                      ) : null}
                      {entry.dog_name ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <DogIcon className="h-3 w-3" /> {entry.dog_name}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {translatePoint653Reason(entry.reason, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserX className="h-5 w-5" /> {t("dailyPlanning.excluded.title", { count: sectionScopedResult.agentExclusions.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sectionScopedResult.agentExclusions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("dailyPlanning.excluded.none")}</p>
              ) : (
                <ul className="divide-y">
                  {sectionScopedResult.agentExclusions.map((e: any) => (
                    <li
                      key={e.agent_id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>{e.agent_name}</span>
                      <span className="text-muted-foreground">{translatePlanningReason(e.reason, t)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog
        open={!!confirmReplace}
        onOpenChange={(open) => !open && setConfirmReplace(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dailyPlanning.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dailyPlanning.confirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>{t("dailyPlanning.confirm.keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={running}
              onClick={(event) => {
                event.preventDefault();
                const id = confirmReplace?.existingId ?? null;
                console.info("[daily-planning] confirm.replace", id);
                setConfirmReplace(null);
                void executePlanning(id);
              }}
            >
              {t("dailyPlanning.confirm.replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CheckpointAssignmentTable({ checkpoints }: { checkpoints: CheckpointAssignment[] }) {
  const { t } = useI18n();
  return (
    <PageContentShell>
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MapPin className="h-5 w-5" /> {t("dailyPlanning.assignments.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("dailyPlanning.assignments.description")}</p>
      </div>
      <div className="mt-4">
        {checkpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dailyPlanning.assignments.noCheckpoints")}
          </p>
        ) : (
          <div className="space-y-4">
            {checkpoints.map((cp: any) => {
              // Display-only: stable matricule order (unfilled slots stay at the end).
              const slots = [...cp.slots].sort((a: any, b: any) => {
                const aMle = a.team?.professional_number ?? "";
                const bMle = b.team?.professional_number ?? "";
                if (!a.team && b.team) return 1;
                if (a.team && !b.team) return -1;
                return compareMatriculeAsc(aMle, bMle);
              });
              return (
              <div key={cp.checkpoint_id} className="enterprise-card hover-lift rounded-2xl p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{cp.checkpoint_name}</span>
                  {cp.night_only && (
                    <StatusBadge tone="primary">
                      <Moon className="h-3 w-3" /> {t("dailyPlanning.badge.nightOnly")}
                    </StatusBadge>
                  )}
                  {cp.is_understaffed ? (
                    <StatusBadge tone="danger">{t("dailyPlanning.badge.understaffed")}</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">{t("dailyPlanning.badge.fullyStaffed")}</StatusBadge>
                  )}
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {cp.posts.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{t("dailyPlanning.posts.none")}</span>
                  ) : (
                    cp.posts.map((post: any) => {
                      const filled = post.staffed >= post.required;
                      return (
                        <StatusBadge key={post.post_id} tone={filled ? "success" : "warning"}>
                          {t(`specialty.${post.specialty_required}`)}: {post.staffed}/{post.required}
                        </StatusBadge>
                      );
                    })
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.specialty")}</th>
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.handler")}</th>
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.dog")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((slot: any, idx: any) => (
                        <tr key={`${cp.checkpoint_id}-${slot.post_id}-${idx}`} className="border-b border-border/40 even:bg-muted/20">
                          <td className="px-4 py-3 font-medium">
                            {t(`specialty.${slot.specialty_required}`)}
                          </td>
                          <td className="px-4 py-3">
                            {slot.team ? (
                              <span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{slot.team.professional_number}
                                </span>{" "}
                                {slot.team.agent_name}
                              </span>
                            ) : (
                              <span className="italic text-destructive">{t("dailyPlanning.slot.unfilled")}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {slot.team ? (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <DogIcon className="h-3.5 w-3.5" /> {slot.team.dog_name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContentShell>
  );
}
