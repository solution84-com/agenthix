/**
 * Compile-time exactness between two types, for pinning a hand-written mirror
 * of a wire contract to the contract itself.
 *
 * Two things a naive check gets wrong, both found by mutating a real type and
 * watching nothing fail:
 *
 *  1. **Mutual assignability does not see an OPTIONAL field added on one
 *     side.** An object type without an optional property is assignable to one
 *     that has it, in both directions. So the key sets are compared first,
 *     through `keyof`, which does see an optional key.
 *  2. **`never` is assignable to `true`.** A helper alias that "fails" by
 *     resolving to `never`, fed back into another `X extends true ? … : …`
 *     check, passes it. The failure has to RESOLVE to `never` for an
 *     `= true` assignment to reject it, which is why the conditionals below
 *     nest rather than compose, and why the recursive half answers
 *     `true | false` rather than `true | never`.
 *
 * The comparison reaches nested object types and the element type of an array,
 * because a wire contract's shape is not only its top level: a field added to
 * a nested type is exactly as breaking, and `.strict()` validation refuses it
 * at runtime with nothing having failed at build.
 *
 * Primitives are not compared structurally — mutual assignability already
 * covers those. Functions are not treated as key bags, and an array is
 * compared by its element type rather than by its own keys.
 *
 * ## What this does NOT guard, stated because a guard that looks total and is
 * ## not is worse than one that admits its limits
 *
 * Each of these was confirmed by writing the shape and watching the assertion
 * pass, not reasoned about. None is reachable from the types pinned with this
 * today, so there is nothing outstanding — but `Exact` is exported as a
 * general utility, and the next type pinned with it may not be so simple.
 *
 *  - **A field whose type is a UNION OF OBJECTS passes vacuously.** `keyof` of
 *    a union is the key INTERSECTION, so disjoint members answer `never`,
 *    `[never] extends [never]` holds in both directions, and the per-key walk
 *    runs over nothing. `Exact<{u: {a: string} | {b?: number}}, {u: {a: string}
 *    | {b?: number; extra?: boolean}}>` is `true`: mutual assignability cannot
 *    see the optional `extra`, and `SameShape` had nothing to compare.
 *  - **A field that is an object OR a primitive falls to the permissive
 *    branch.** `IsPlainObject` distributes over the union and answers
 *    `boolean`, which is not `true`, so the whole field is skipped.
 *    `Exact<{m: string | {a?: 1}}, {m: string | {a?: 1; b?: 2}}>` is `true`.
 *  - **A RECURSIVE type does not compile.** `Exact<Tree, Tree2>` where a tree
 *    holds `children: Tree[]` raises `TS2615` ("circularly references itself
 *    in mapped type"), which is a hard error rather than a silent pass — loud,
 *    but it means this cannot pin a recursive contract at all.
 *
 * A union of string LITERALS is not in that list and needs no special care:
 * the permissive branch skips it, and mutual assignability compares such a
 * union exactly, so a member added to or removed from one side still fails.
 */

type IsPlainObject<T> = T extends object
  ? T extends readonly unknown[]
    ? false
    : T extends (...args: never[]) => unknown
      ? false
      : true
  : false

/** An array's element type, so a field of `T[]` is compared as `T`. */
type Element<T> = T extends readonly (infer E)[] ? E : T

/** Optional and nullable fields are compared by what they hold. */
type Held<T> = Element<NonNullable<T>>

/** `true` only when every key matches at every depth. Answers `false`, never `never`. */
export type SameShape<A, B> = IsPlainObject<A> extends true
  ? IsPlainObject<B> extends true
    ? [keyof A] extends [keyof B]
      ? [keyof B] extends [keyof A]
        ? { [K in keyof A & keyof B]: SameShape<Held<A[K]>, Held<B[K]>> }[keyof A & keyof B] extends true
          ? true
          : false
        : false
      : false
    : false
  : true

/**
 * `true` when the two agree exactly, and `never` when they do not — so
 * `const _pin: Exact<A, B> = true` is a build failure on any drift.
 */
export type Exact<A, B> = SameShape<A, B> extends true
  ? [A] extends [B]
    ? [B] extends [A]
      ? true
      : never
    : never
  : never
