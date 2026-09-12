// Types shared across the onboarding app

export type Track = '2eme' | '3eme' | 'bac';
export type Tier = 'explorer' | 'challenger' | 'elite';
export type QuestionType = 'multiple_choice' | 'drag_drop' | 'short_input';

export interface RegistrationData {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  track?: Track;
  score?: number;
  tier?: Tier;
  completed?: boolean;
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correct_answer: string | string[];
  explanation?: string;
  order_index: number;
  is_active?: boolean;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  registration: RegistrationData | null;
  track: Track | null;
  answers: Record<string, string | string[]>;
  score: number;
  tier: Tier;
}
