export type TxType = 'ingreso' | 'gasto' | 'transferencia' | 'ajuste'
export type AccountType = 'corriente' | 'remunerada' | 'efectivo' | 'inversion'

export interface Account {
  id: string; entity: string; name: string; type: AccountType
  description: string | null; initial_balance: number; archived: boolean
}
export interface AccountWithBalance extends Account { balance: number }
export interface Category {
  id: string; parent_id: string | null; name: string; kind: 'ingreso' | 'gasto'
  icon: string | null; color: string | null; active: boolean
}
export interface Tx {
  id: string; type: TxType; amount: number; date: string
  account_id: string; dest_account_id: string | null; category_id: string | null
  description: string | null; status: 'activo' | 'anulado'; source: string
}
export const ACCOUNT_LABEL: Record<AccountType, string> = {
  corriente: 'Cuenta corriente', remunerada: 'Cuenta remunerada', efectivo: 'Efectivo', inversion: 'Cuenta de inversión',
}
