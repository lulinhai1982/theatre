import {isDerivation, prism, val} from '@theatre/dataverse'
import type {IDerivation, Pointer} from '@theatre/dataverse'
import {useDerivation} from '@theatre/react'
import type {$IntentionalAny} from '@theatre/shared/utils/types'
import React, {useMemo, useRef} from 'react'
import {invariant} from './invariant'
import {emptyArray} from '@theatre/shared/utils'

type DeriveAll<T> = IDerivation<
  {
    [P in keyof T]: T[P] extends $<infer R> ? R : never
  }
>

export type $<T> = IDerivation<T> | Pointer<T>

function deriveAllD<T extends [...$<any>[]]>(obj: T): DeriveAll<T>
function deriveAllD<T extends Record<string, $<any>>>(obj: T): DeriveAll<T>
function deriveAllD<T extends Record<string, $<any>> | $<any>[]>(
  obj: T,
): DeriveAll<T> {
  return prism(() => {
    if (Array.isArray(obj)) {
      const values = new Array(obj.length)
      for (let i = 0; i < obj.length; i++) {
        values[i] = obj[i].getValue()
      }
      return values
    } else {
      const values: $IntentionalAny = {}
      for (const k in obj) {
        values[k] = val((obj as Record<string, $<any>>)[k])
      }
      return values
    }
  }) as $IntentionalAny
}

export function useReactPrism(
  fn: () => React.ReactNode,
  deps: readonly any[] = emptyArray,
): React.ReactElement {
  const derivation = useMemo(() => prism(fn), deps)
  return <DeriveElement der={derivation} />
}

export function reactPrism(fn: () => React.ReactNode): React.ReactElement {
  return <DeriveElement der={prism(fn)} />
}

function DeriveElement(props: {der: IDerivation<React.ReactNode>}) {
  const node = useDerivation(props.der)
  return <>{node}</>
}

/** This is only used for type checking to make sure the APIs are used properly */
interface TSErrors<M> extends Error {}

type ReactDeriver<Props extends {}> = (
  props: {
    [P in keyof Props]: Props[P] extends IDerivation<infer _>
      ? TSErrors<"Can't both use Derivation properties while wrapping with deriver">
      : Props[P] | IDerivation<Props[P]>
  },
) => React.ReactElement | null

/**
 * Wrap up the component to enable it to take derivable properties.
 * Invoked similarly to `React.memo`.
 *
 * @remarks
 * This is an experimental interface for wrapping components in a version
 * which allows you to pass in derivations for any of the properties that
 * previously took only values.
 */
export function deriver<Props extends {}>(
  Component: React.ComponentType<Props>,
): ReactDeriver<Props> {
  return React.forwardRef(function deriverRender(
    props: Record<string, $IntentionalAny>,
    ref,
  ) {
    let observableArr = []
    const observables: Record<string, IDerivation<$IntentionalAny>> = {}
    const normalProps: Record<string, $IntentionalAny> = {
      ref,
    }
    for (const key in props) {
      const value = props[key]
      if (isDerivation(value)) {
        observableArr.push(value)
        observables[key] = value
      } else {
        normalProps[key] = value
      }
    }

    const initialCount = useRef(observableArr.length)
    invariant(
      initialCount.current === observableArr.length,
      `expect same number of observable props on every invocation of deriver wrapped component.`,
      {initial: initialCount.current, count: observableArr.length},
    )

    const allD = useMemo(() => deriveAllD(observables), observableArr)
    const observedPropState = useDerivation(allD)

    return (
      observedPropState &&
      React.createElement(Component, {
        ...normalProps,
        ...observedPropState,
      } as Props)
    )
  })
}
