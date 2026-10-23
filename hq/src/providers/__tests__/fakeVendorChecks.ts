/** A vendor that answers what a test says, per key, and remembers what it was asked. Every key works unless told. */
import type { CheckResult, CheckTarget, VendorChecks } from '../checks'

export class FakeVendorChecks implements VendorChecks {
  readonly asked: CheckTarget[] = []
  private answers = new Map<string, CheckResult>()

  answer(key: string | null, result: CheckResult): this {
    this.answers.set(key ?? '', result)
    return this
  }

  async check(target: CheckTarget): Promise<CheckResult> {
    this.asked.push(target)
    return this.answers.get(target.key ?? '') ?? { ok: true }
  }
}
