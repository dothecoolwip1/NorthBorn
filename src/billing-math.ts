export type BillingLine = { description: string; quantity: string | number; rate: string | number }
export function nonNegativeAmount(value: string | number, label = 'Amount') {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a finite number of zero or more.`)
  return amount
}
// Decimal half-up rounding matches the database's rate(12,2), quantity(12,3)
// and tax_rate(7,4) types, including intermediate line rounding.
function scaled(value: number, digits: number) {
  if(value>=1e12)throw new Error('Invoice amount is too large.')
  const [whole,fraction]=value.toFixed(10).split('.')
  return BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.slice(0,digits))+(Number(fraction[digits])>=5?1n:0n)
}
export function invoiceTotals(lines: BillingLine[], taxRate: string | number) {
  const taxPercent = nonNegativeAmount(taxRate, 'Tax rate')
  if (taxPercent > 100) throw new Error('Tax rate cannot exceed 100%.')
  const subtotalCents = lines.filter(line => line.description.trim()).reduce((sum, line) => {
    const quantity=scaled(nonNegativeAmount(line.quantity,'Quantity'),3)
    const rate=scaled(nonNegativeAmount(line.rate,'Rate'),2)
    if(quantity>999999999999n||rate>999999999999n)throw new Error('Invoice line is too large.')
    return sum+(quantity*rate+500n)/1000n
  },0n)
  const taxCents=(subtotalCents*scaled(taxPercent,4)+500000n)/1000000n
  if(subtotalCents+taxCents>999999999999n)throw new Error('Invoice total is too large.')
  return { subtotal:Number(subtotalCents)/100,tax:Number(taxCents)/100,total:Number(subtotalCents+taxCents)/100 }
}
export function invoiceLineCategory(description: string, category?: string) {
  if (category) return category
  return description === 'Swamper' ? 'labour' : description === 'Disposal' ? 'disposal' : description === 'Overtime' ? 'overtime' : description === 'Crew Truck' ? 'transport' : description && description !== 'Other' ? 'equipment' : 'other'
}
