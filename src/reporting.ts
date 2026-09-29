export function csvCell(value: unknown) {
  let text=String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text)) text="'"+text
  return '"'+text.replaceAll('"','""')+'"'
}
export function csvDocument(rows: unknown[][]) {
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')
}
export function localDate(date=new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function inDateRange(value: string | null, start: string, end: string) {
  return Boolean(value && (!start || value.slice(0,10)>=start) && (!end || value.slice(0,10)<=end))
}
export function financialSummary(invoices: {status:string;currency_code:string;total:number|string;amount_paid:number|string;balance_due:number|string;credit_total?:number|string}[]) {
  const totals=new Map<string,{currency:string;revenue:number;paid:number;credits:number;outstanding:number}>()
  for(const invoice of invoices){
    if(['draft','void'].includes(invoice.status))continue
    const currency=invoice.currency_code||'CAD'
    const row=totals.get(currency)||{currency,revenue:0,paid:0,credits:0,outstanding:0}
    row.revenue+=Number(invoice.total);row.paid+=Number(invoice.amount_paid);row.credits+=Number(invoice.credit_total||0);row.outstanding+=Number(invoice.balance_due)
    totals.set(currency,row)
  }
  return [...totals.values()]
}
