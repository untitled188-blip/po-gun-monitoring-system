export type Status = 'OK' | 'NG' | 'UNVERIFIED'
export type ModelName = 'CITY 4D' | 'CITY 5D' | 'HR-V' | 'WR-V'

export interface Equipment {
  id: number
  process_pk?: number
  transformer_pk?: number
  po_gun_pk?: number
  source_row?: number | null
  car_model: string
  zone: string
  process: string
  transformer_id: string
  po_gun_id: string
  gun_type?: string | null
  current_actual: number | null
  current_target: number | null
  current_min: number | null
  current_max: number | null
  current_deviation: number | null
  current_deviation_percent: number | null
  current_unit: string
  current_status: Status
  pressure_actual: number | null
  pressure_target: number | null
  pressure_min: number | null
  pressure_max: number | null
  pressure_deviation: number | null
  pressure_deviation_percent: number | null
  pressure_unit: string
  pressure_status: Status
  overall_status: Status
  snapshot_label?: string | null
  map_position?: string | null
  coordinates_verified?: boolean
  readings?: Reading[]
  corrective_actions?: CorrectiveAction[]
}

export interface Reading {
  id: number
  parameter_name: 'Welding Current' | 'Pressure'
  value: number
  unit: string
  observed_at: string | null
  recorded_at: string | null
  source: string
  note?: string | null
}

export interface StatusCounts {
  total: number
  ok: number
  ng: number
  unverified: number
  ok_rate: number
}

export interface ModelComparison extends StatusCounts {
  model: string
  current_ng: number
  pressure_ng: number
}

export interface ZoneComparison extends StatusCounts {
  zone: string
  current_ng: number
  pressure_ng: number
}

export interface Dashboard {
  filters: { model: string; zone: string }
  summary: StatusCounts
  current_ng: number
  pressure_ng: number
  abnormal_parameter_count: number
  model_comparison: ModelComparison[]
  zone_comparison: ZoneComparison[]
  abnormal_equipment: Equipment[]
  recent_actions: CorrectiveAction[]
  data_quality: { units_confirmed: boolean; coordinates_verified: boolean; source_snapshot_label: string; notes: string[] }
}

export interface Station extends StatusCounts {
  id: number
  overall_status?: Status
  process: string
  zone: string
  map_position?: string | null
  coordinates_verified: boolean
  current_ng?: number
  pressure_ng?: number
  items?: Equipment[]
}

export interface CorrectiveAction {
  id: number
  display_id: string
  action_code?: string | null
  source_row?: number | null
  assignment_id?: number | null
  car_model?: string | null
  zone?: string | null
  process?: string | null
  transformer_id?: string | null
  po_gun_id?: string | null
  abnormal_parameter: 'Welding Current' | 'Pressure'
  actual_reading?: number | null
  target_or_limit?: number | null
  target_or_limit_text?: string | null
  problem_description?: string | null
  corrective_action?: string | null
  pic?: string | null
  date_reported?: string | null
  due_date?: string | null
  action_status: string
  verified_by?: string | null
  verification_date?: string | null
  remarks?: string | null
  verification_status?: string | null
  source_label?: string
}

export interface User { id: number; username: string; role: string }
export interface ApiPage<T> { items: T[]; total: number; offset: number; limit: number }
