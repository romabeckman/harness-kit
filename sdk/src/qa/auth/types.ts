export type QaAuthMode = 'none' | 'basic' | 'bearer' | 'api-key' | 'cookie'
export interface QaResolvedAuth { profile: string; mode: QaAuthMode; headers: Record<string, string>; environment: Record<string, string>; basic?: { username: string; password: string }; cookie?: { name: string; value: string; domain?: string; path?: string } }
export interface QaAuthProfileDescription { name: string; mode: QaAuthMode }
