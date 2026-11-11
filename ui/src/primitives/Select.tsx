import { NativeSelect, type NativeSelectProps } from './NativeSelect'

export type SelectProps = NativeSelectProps

/** @deprecated The one select is `NativeSelect`; this name draws it. */
export function Select(props: SelectProps) {
  return <NativeSelect {...props} />
}
