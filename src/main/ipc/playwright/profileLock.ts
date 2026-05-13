/**
 * Conjunto de IDs de cuentas con un browser abierto actualmente.
 * Evita lanzar dos contextos simultáneos sobre el mismo perfil persistente
 * (eso corrompe el perfil de Chromium y causa "ProfileInUse").
 */
export const activeProfiles = new Set<number>();
