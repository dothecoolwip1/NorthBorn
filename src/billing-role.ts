export function billingRole(rows: {role: {key: string} | null}[] | null | undefined) {
  const roles = new Set((rows || []).map(row => row.role?.key))
  return ['owner','admin','accounting'].find(role => roles.has(role)) || ''
}
