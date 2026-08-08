import type { DbClient } from "@/integrations/database/client";
import {
  resolveSectionCommanderDisplay,
  type ExclusionLike,
  type SectionCommanderDisplay,
  type SectionCommanderDisplayMode,
} from "@/lib/section-commander-display";

export type AttendanceSheetCommanderInput = {
  fullName: string;
  grade: string;
  mle: string;
};

export type AttendanceSheetCommanderResolution = {
  fullName: string;
  grade: string;
  mle: string;
  /**
   * True when the Chef de section is excluded and no available
   * Adjoint Chef de section exists in the same section — PDF shows blank lines.
   */
  needsManualFill: boolean;
  mode: SectionCommanderDisplayMode;
};

type AgentRow = {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  professional_number: string;
  section_id: string | null;
  fonction: string | null;
  active: boolean;
};

/**
 * Resolve who appears as section commander on the attendance sheet PDF.
 * Delegates to the shared Section-page replacement rules.
 */
export async function resolveAttendanceSheetCommander(
  client: DbClient,
  sectionId: string,
  commander: AttendanceSheetCommanderInput,
  exclusions: ExclusionLike[],
): Promise<AttendanceSheetCommanderResolution> {
  const { data, error } = await client
    .from("agents")
    .select("id, first_name, last_name, grade, professional_number, section_id, fonction, active")
    .eq("section_id", sectionId)
    .eq("active", true);

  if (error) throw error;

  const resolved: SectionCommanderDisplay = resolveSectionCommanderDisplay({
    sectionId,
    agents: (data ?? []) as AgentRow[],
    exclusions,
    fallback: {
      fullName: commander.fullName,
      grade: commander.grade,
      mle: commander.mle,
    },
  });

  return {
    fullName: resolved.fullName,
    grade: resolved.grade,
    mle: resolved.mle,
    needsManualFill: resolved.needsManualFill,
    mode: resolved.mode,
  };
}
