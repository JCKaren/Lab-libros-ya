export const ROLES = ['cliente', 'administrador'] as const;
export type Role = (typeof ROLES)[number];
