export type ShiftType = "day" | "night";
export type Gender = "male" | "female";
export type { PersonnelFonction } from "@/lib/personnel-fonction";
import type { PersonnelFonction } from "@/lib/personnel-fonction";

export type Section = {
  id: string;
  name: string;
  shift_type: ShiftType;
  active: boolean;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
  created_at: string;
  updated_at: string;
};

export type SectionWithAgentCount = Section & {
  agent_count: number;
};

export type CreateSectionInput = {
  name: string;
  shift_type: ShiftType;
  active: boolean;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
};

export type UpdateSectionInput = {
  name: string;
  shift_type: ShiftType;
  active: boolean;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
};

export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

export type Agent = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: Gender;
  fonction: PersonnelFonction;
  /** Null for legacy rows not yet filled — UI shows « Non renseignée ». */
  marital_status: MaritalStatus | null;
  /** ISO `yyyy-MM-dd`. Null for legacy rows until filled. */
  date_naissance: string | null;
  section_id: string | null;
  dog_id: string | null;
  is_section_chief: boolean;
  active: boolean;
  phone: string | null;
  address: string | null;
  observations: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentSectionSummary = {
  id: string;
  name: string;
};

export type AgentDogSummary = {
  id: string;
  name: string;
  specialty: string;
  status: string;
};

export type AgentRow = Agent & {
  sections: AgentSectionSummary | null;
  dogs: AgentDogSummary | null;
};

export type AgentWriteInput = {
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: Gender;
  fonction: PersonnelFonction;
  /** Required on create/edit form; null allowed when preserving legacy rows. */
  marital_status: MaritalStatus | null;
  /** Required on create/edit form (`yyyy-MM-dd`); null allowed for legacy rows. */
  date_naissance: string | null;
  section_id: string | null;
  dog_id: string | null;
  phone: string | null;
  address: string | null;
  observations: string | null;
  active: boolean;
  photo_url?: string | null;
};

export type DogSpecialty = "narcotics" | "explosives" | "currency";
export type DogStatus = "available" | "sick" | "heat";

export type Dog = {
  id: string;
  name: string;
  gender: Gender;
  specialty: DogSpecialty;
  status: DogStatus;
  active: boolean;
  photo_url: string | null;
  breed: string | null;
  microchip_number: string | null;
  date_of_birth: string | null;
  training_level: string | null;
  veterinary_notes: string | null;
  observations: string | null;
  assignment_date: string | null;
  vaccination_info: string | null;
  health_status: string | null;
  created_at: string;
  updated_at: string;
};

export type DogAgentSummary = {
  id: string;
  first_name: string;
  last_name: string;
  section: { id: string; name: string } | null;
};

export type DogRow = Dog & {
  agent: DogAgentSummary | null;
};

export type DogWriteInput = {
  name: string;
  gender: Gender;
  specialty: DogSpecialty;
  status: DogStatus;
  active: boolean;
  breed: string | null;
  microchip_number: string | null;
  date_of_birth: string | null;
  training_level: string | null;
  veterinary_notes: string | null;
  observations: string | null;
  assignment_date: string | null;
  vaccination_info: string | null;
  health_status: string | null;
  photo_url?: string | null;
};

export type CreateDogInput = DogWriteInput & {
  agent_id?: string | null;
};

export type UpdateDogInput = DogWriteInput & {
  agent_id?: string | null;
  previous_agent_id?: string | null;
};

export type CheckpointAllowedGender = "all" | "male" | "female";
export type CheckpointFemalePolicy = "allowed" | "preferred" | "not_allowed";
export type CheckpointPriority = 1 | 2 | 3 | 4;
export type CheckpointPostSpecialty = "narcotics" | "explosives" | "currency";

export type CheckpointPost = {
  id: string;
  checkpoint_id: string;
  specialty_required: CheckpointPostSpecialty;
  required_agents: number;
  active: boolean;
  shift: ShiftType;
  dog_required: boolean;
  allowed_gender: CheckpointAllowedGender;
  created_at: string;
  updated_at: string;
};

export type Checkpoint = {
  id: string;
  name: string;
  active: boolean;
  night_only: boolean;
  allowed_gender: CheckpointAllowedGender;
  operating_days: number[];
  day_shift_enabled: boolean;
  night_shift_enabled: boolean;
  female_policy: CheckpointFemalePolicy;
  priority: CheckpointPriority;
  /** true = Mandatory, false = Optional. Default true. */
  mandatory: boolean;
  day_explosives: number;
  day_narcotics: number;
  night_explosives: number;
  night_narcotics: number;
  required_drugs: number;
  required_explosives: number;
  created_at: string;
  updated_at: string;
};

export type CheckpointWithPosts = Checkpoint & {
  posts: CheckpointPost[];
};

export type CheckpointOperationalInput = {
  name: string;
  active: boolean;
  operating_days: number[];
  day_shift_enabled: boolean;
  night_shift_enabled: boolean;
  day: { explosives: number; narcotics: number };
  night: { explosives: number; narcotics: number };
  female_policy: CheckpointFemalePolicy;
  priority: CheckpointPriority;
  /** true = Mandatory, false = Optional. Default true. */
  mandatory: boolean;
};

export type CreateCheckpointInput = CheckpointOperationalInput;
export type UpdateCheckpointInput = CheckpointOperationalInput;

export interface DatabaseProvider {
  getSections(): Promise<SectionWithAgentCount[]>;
  createSection(input: CreateSectionInput): Promise<Section>;
  updateSection(id: string, input: UpdateSectionInput): Promise<Section>;
  deleteSection(id: string): Promise<void>;
  getAgents(): Promise<AgentRow[]>;
  getAgent(id: string): Promise<AgentRow | null>;
  createAgent(input: AgentWriteInput): Promise<Agent>;
  updateAgent(id: string, input: AgentWriteInput): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  getDogs(): Promise<DogRow[]>;
  getDog(id: string): Promise<DogRow | null>;
  createDog(input: CreateDogInput): Promise<Dog>;
  updateDog(id: string, input: UpdateDogInput): Promise<Dog>;
  deleteDog(id: string): Promise<void>;
  getCheckpoints(): Promise<CheckpointWithPosts[]>;
  getCheckpoint(id: string): Promise<CheckpointWithPosts | null>;
  createCheckpoint(input: CreateCheckpointInput): Promise<Checkpoint>;
  updateCheckpoint(id: string, input: UpdateCheckpointInput): Promise<Checkpoint>;
  deleteCheckpoint(id: string): Promise<void>;
}
